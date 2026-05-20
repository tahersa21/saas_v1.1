import { Router, type IRouter } from "express";
import { db, usageLogsTable } from "@workspace/db";
import { requireApiKey } from "../../middlewares/apiKeyAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import {
  detectModelProvider,
  normalizeToPlanModelId,
  chatWithGemini,
  chatWithOpenAICompat,
  chatWithMistralRawPredict,
  streamChatWithGemini,
  streamChatWithOpenAICompat,
  streamChatWithMistralRawPredict,
  type ChatMessage,
  type ToolDefinition,
  type ToolCall,
} from "../../lib/vertexai";
import { calculateChatCost } from "../../lib/billing";
import { generateRequestId } from "../../lib/crypto";
import {
  checkContent,
  injectSafetyPrompt,
  isGuardrailSuspended,
  recordViolation,
} from "../../lib/guardrails";
import { stripThinkTags, ThinkTagFilter, deductAndLog, isModelInPlan } from "../../lib/chatUtils";

const router: IRouter = Router();

// ── Responses API tool format (flat, no nesting under "function") ─────────────
interface ResponsesApiTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

/**
 * Convert OpenAI Responses API tool format → internal Chat completions format.
 * Responses API: { type, name, description, parameters }
 * Chat format:   { type, function: { name, description, parameters } }
 */
function convertTools(rawTools: unknown): ToolDefinition[] | undefined {
  if (!Array.isArray(rawTools) || rawTools.length === 0) return undefined;
  return (rawTools as ResponsesApiTool[]).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Extract text content from a Responses API content field which can be:
 *   - a plain string
 *   - an array of content parts: [{type:"input_text"|"text", text:"..."}]
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: string; text: string } => typeof p === "object" && p !== null && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
  }
  return "";
}

/**
 * Parse the Responses API `input` field into our internal ChatMessage[].
 * Handles:
 *   - plain string
 *   - [{role, content}]  – regular messages
 *   - [{type:"function_call", id, name, arguments}]  – assistant tool calls
 *   - [{type:"function_call_output", call_id, output}]  – tool results
 *
 * Gemini requires functionResponse.name = the function's NAME (not the call ID).
 * We build a call_id → function_name map from function_call items first.
 */
function parseInput(input: unknown): ChatMessage[] {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (!Array.isArray(input)) return [];

  // First pass: build call_id → function_name map so tool results can carry the correct name
  const callIdToName = new Map<string, string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (m.type === "function_call" && typeof m.id === "string" && typeof m.name === "string") {
      callIdToName.set(m.id, m.name);
    }
  }

  const messages: ChatMessage[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;

    if (m.type === "function_call") {
      // Assistant's previous tool call
      const tc: ToolCall = {
        id: (m.id as string) || `call_${Date.now()}`,
        type: "function",
        function: {
          name: (m.name as string) || "",
          arguments: (m.arguments as string) || "{}",
        },
      };
      messages.push({ role: "model", content: null, tool_calls: [tc] });
    } else if (m.type === "function_call_output") {
      // Tool result — look up function name by call_id for Gemini's functionResponse.name
      const output = typeof m.output === "string" ? m.output : JSON.stringify(m.output);
      const callId = m.call_id as string;
      const funcName = callIdToName.get(callId) ?? (m.name as string | undefined);
      const msg: ChatMessage = {
        role: "tool",
        content: output,
        tool_call_id: callId,
        name: funcName,
      };
      messages.push(msg);
    } else if (m.role) {
      // Regular message
      const role =
        m.role === "assistant" ? "model" : m.role === "system" ? "system" : "user";
      messages.push({
        role: role as ChatMessage["role"],
        content: extractTextContent(m.content),
      });
    }
  }

  return messages;
}

/**
 * OpenAI Responses API — used by n8n OpenAI Chat Model node when "Use Responses API" is enabled.
 * Maps to our existing Gemini/Claude/compat chat backend.
 *
 * Request format:
 *   { model, input: string | [{role, content}], tools?: [...], stream?: boolean,
 *     temperature?, max_output_tokens? }
 *
 * Non-streaming response:
 *   { id, object:"response", created_at, model, output:[{type:"message"|"function_call", ...}], usage }
 *
 * Streaming response (SSE):
 *   Events: response.created → response.output_text.delta (×N) → response.completed
 *   (or function_call events when the model uses a tool)
 */
router.post("/v1/responses", requireApiKey, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const model = typeof body.model === "string" ? body.model.toLowerCase().trim() : "";
  if (!model) {
    res.status(400).json({ error: "model is required" });
    return;
  }

  const stream = body.stream === true;

  // Parse input messages
  const messages = parseInput(body.input);
  if (messages.length === 0) {
    res.status(400).json({ error: "input must be a non-empty string or array of messages" });
    return;
  }

  // Parse tools (Responses API format → internal format)
  const tools = convertTools(body.tools);

  const temperature = typeof body.temperature === "number" ? body.temperature : undefined;
  const maxOutputTokens =
    typeof body.max_output_tokens === "number"
      ? body.max_output_tokens
      : typeof body.max_tokens === "number"
        ? body.max_tokens
        : undefined;

  const apiKey = req.apiKey!;
  const requestId = req.preassignedRequestId ?? generateRequestId();
  const created = Math.floor(Date.now() / 1000);

  // Plan model check
  const allowed = apiKey.plan.modelsAllowed;
  const planModel = normalizeToPlanModelId(model);
  const modelInPlan = isModelInPlan(allowed, planModel);
  if (!modelInPlan && apiKey.topupCredit <= 0) {
    const errMsg =
      `Model "${model}" is not in your plan ("${apiKey.plan.name}"). ` +
      `Use top-up credit (currently $${apiKey.topupCredit.toFixed(4)}) or upgrade your plan. ` +
      `Plan models: ${allowed.join(", ")}`;
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected", errorMessage: errMsg,
    });
    res.status(403).json({ error: errMsg });
    return;
  }

  // Rate limit
  const _rpm = apiKey.rpmLimit ?? apiKey.plan.rpm;
  const _bucket = apiKey.rpmLimit ? -apiKey.id : apiKey.userId;
  const withinLimit = await checkRateLimit(_bucket, _rpm, "responses");
  if (!withinLimit) {
    const errMsg = `Rate limit exceeded. Your plan allows ${apiKey.plan.rpm} RPM.`;
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected", errorMessage: errMsg,
    });
    res.status(429).json({ error: errMsg });
    return;
  }

  // Pre-flight credit check
  const estimatedInput = messages.reduce((a, m) => a + Math.ceil((typeof m.content === "string" ? m.content.length : 0) / 4), 0);
  const estimatedOutput = maxOutputTokens ?? 2000;
  const minCost = calculateChatCost(planModel, estimatedInput, estimatedOutput);
  const availableForThisModel = modelInPlan ? apiKey.accountCreditBalance : apiKey.topupCredit;
  if (availableForThisModel < minCost) {
    const errMsg = modelInPlan
      ? `Insufficient credits. Balance: $${apiKey.accountCreditBalance.toFixed(6)}.`
      : `Insufficient top-up credit ($${apiKey.topupCredit.toFixed(6)}) for out-of-plan model "${model}".`;
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected", errorMessage: errMsg,
    });
    res.status(402).json({ error: errMsg });
    return;
  }

  // Layer 4: reject if account is suspended
  const suspended = await isGuardrailSuspended(apiKey.userId);
  if (suspended) {
    res.status(403).json({
      error:
        "🚫 حسابك موقوف بسبب انتهاك متكرر لسياسات الاستخدام. تواصل مع الدعم الفني. | " +
        "Your account has been suspended due to repeated policy violations. Please contact support.",
    });
    return;
  }

  // Layer 3: Keyword content check (skip tool messages)
  const contentCheck = checkContent(messages.filter((m) => m.role === "user" || m.role === "model"));
  if (contentCheck.blocked) {
    const violation = await recordViolation(apiKey.userId, contentCheck.category!, {
      apiKeyId: apiKey.id,
      requestId,
      model,
      messages,
      ip: (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress,
    });
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "rejected",
      errorMessage: `Guardrail blocked (${contentCheck.category}). Violation #${violation.warningNumber}`,
    });
    res.status(400).json({ error: violation.message });
    return;
  }

  // Layer 2: Inject safety system prompt
  const guardedMessages = injectSafetyPrompt(messages);
  const opts = { temperature, maxOutputTokens, tools };
  const provider = detectModelProvider(model);

  const responseId = `resp_${requestId}`;
  const itemId = `msg_${requestId}`;

  // ── STREAMING PATH ────────────────────────────────────────────────────────
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let inputTokens = 0;
    let outputTokens = 0;
    let streamError: string | null = null;
    let clientDisconnected = false;
    let fullText = "";
    let finalToolCalls: ToolCall[] | undefined;
    const thinkFilter = new ThinkTagFilter();
    const abortController = new AbortController();

    res.on("close", () => {
      clientDisconnected = true;
      abortController.abort();
    });

    sendEvent("response.created", {
      type: "response.created",
      response: { id: responseId, object: "response", created_at: created, model, status: "in_progress" },
    });

    sendEvent("response.output_item.added", {
      type: "response.output_item.added",
      output_index: 0,
      item: { id: itemId, type: "message", status: "in_progress", role: "assistant", content: [] },
    });

    sendEvent("response.content_part.added", {
      type: "response.content_part.added",
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "" },
    });

    const optsWithSignal = { ...opts, signal: abortController.signal };

    try {
      const generator =
        provider === "gemini"
          ? streamChatWithGemini(model, guardedMessages, optsWithSignal)
          : provider === "mistral-raw-predict"
            ? streamChatWithMistralRawPredict(model, guardedMessages, optsWithSignal)
            : streamChatWithOpenAICompat(model, guardedMessages, optsWithSignal);

      for await (const event of generator) {
        if (clientDisconnected) break;
        if (event.type === "delta") {
          const text = thinkFilter.push(event.text);
          if (text) {
            fullText += text;
            sendEvent("response.output_text.delta", {
              type: "response.output_text.delta",
              item_id: itemId,
              output_index: 0,
              content_index: 0,
              delta: text,
            });
          }
        } else {
          const flushed = thinkFilter.flush();
          if (flushed) {
            fullText += flushed;
            sendEvent("response.output_text.delta", {
              type: "response.output_text.delta",
              item_id: itemId,
              output_index: 0,
              content_index: 0,
              delta: flushed,
            });
          }
          if (event.type === "done") {
            inputTokens = event.inputTokens;
            outputTokens = event.outputTokens;
            finalToolCalls = event.toolCalls;
          }
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err.message : "Unknown error";
    }

    const costUsd = calculateChatCost(model, inputTokens, outputTokens);

    if (streamError) {
      await db.insert(usageLogsTable).values({
        apiKeyId: apiKey.id, model, inputTokens, outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd: costUsd > 0 ? costUsd : 0,
        requestId, status: "error", errorMessage: streamError,
      });
      if (!res.writableEnded) {
        sendEvent("error", { type: "error", message: streamError });
        res.end();
      }
      return;
    }

    const sufficient = await deductAndLog(apiKey.billingTarget, apiKey.id, model, requestId, inputTokens, outputTokens, costUsd, { modelInPlan });
    if (!sufficient) {
      const insufficientMsg = modelInPlan
        ? "Insufficient credits to complete this request."
        : `Insufficient top-up credit for out-of-plan model "${model}".`;
      if (!res.writableEnded) {
        sendEvent("error", { type: "error", message: insufficientMsg });
        res.end();
      }
      return;
    }

    if (!clientDisconnected && !res.writableEnded) {
      if (finalToolCalls && finalToolCalls.length > 0) {
        // Model wants to call tools — emit function_call output items
        const toolOutput = finalToolCalls.map((tc, i) => ({
          id: tc.id || `call_${i}`,
          type: "function_call",
          name: tc.function.name,
          arguments: tc.function.arguments || "{}",
          status: "completed",
        }));

        sendEvent("response.completed", {
          type: "response.completed",
          response: {
            id: responseId,
            object: "response",
            created_at: created,
            model,
            status: "completed",
            output: toolOutput,
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
            },
          },
        });
      } else {
        // Normal text response
        sendEvent("response.output_text.done", {
          type: "response.output_text.done",
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          text: fullText,
        });

        sendEvent("response.output_item.done", {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            id: itemId,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: fullText }],
          },
        });

        sendEvent("response.completed", {
          type: "response.completed",
          response: {
            id: responseId,
            object: "response",
            created_at: created,
            model,
            status: "completed",
            output: [{
              id: itemId,
              type: "message",
              status: "completed",
              role: "assistant",
              content: [{ type: "output_text", text: fullText }],
            }],
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
            },
          },
        });
      }

      res.end();
    }
    return;
  }

  // ── NON-STREAMING PATH ────────────────────────────────────────────────────
  let chatResult: { content: string; inputTokens: number; outputTokens: number; toolCalls?: ToolCall[] };
  try {
    chatResult =
      provider === "gemini"
        ? await chatWithGemini(model, guardedMessages, opts)
        : provider === "mistral-raw-predict"
          ? await chatWithMistralRawPredict(model, guardedMessages, opts)
          : await chatWithOpenAICompat(model, guardedMessages, opts);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await db.insert(usageLogsTable).values({
      apiKeyId: apiKey.id, model, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, costUsd: 0, requestId, status: "error", errorMessage,
    });
    res.status(502).json({ error: `API error: ${errorMessage}` });
    return;
  }

  const costUsd = calculateChatCost(model, chatResult.inputTokens, chatResult.outputTokens);
  const sufficient = await deductAndLog(
    apiKey.billingTarget, apiKey.id, model, requestId,
    chatResult.inputTokens, chatResult.outputTokens, costUsd, { modelInPlan },
  );

  if (!sufficient) {
    res.status(402).json({ error: "Insufficient credits to complete this request." });
    return;
  }

  // If model wants to call tools, return function_call output items
  if (chatResult.toolCalls && chatResult.toolCalls.length > 0) {
    const toolOutput = chatResult.toolCalls.map((tc, i) => ({
      id: tc.id || `call_${i}`,
      type: "function_call",
      name: tc.function.name,
      arguments: tc.function.arguments || "{}",
      status: "completed",
    }));

    res.json({
      id: responseId,
      object: "response",
      created_at: created,
      model,
      status: "completed",
      output: toolOutput,
      usage: {
        input_tokens: chatResult.inputTokens,
        output_tokens: chatResult.outputTokens,
        total_tokens: chatResult.inputTokens + chatResult.outputTokens,
      },
    });
    return;
  }

  // Normal text response
  res.json({
    id: responseId,
    object: "response",
    created_at: created,
    model,
    status: "completed",
    output: [
      {
        type: "message",
        id: itemId,
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: stripThinkTags(chatResult.content),
          },
        ],
      },
    ],
    usage: {
      input_tokens: chatResult.inputTokens,
      output_tokens: chatResult.outputTokens,
      total_tokens: chatResult.inputTokens + chatResult.outputTokens,
    },
  });
});

export default router;

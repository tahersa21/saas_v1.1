import {
  type ChatMessage,
  type ChatResult,
  type ChatOptions,
  type StreamEvent,
  type ToolCall,
  type ToolDefinition,
  type ToolChoice,
  type FinishReason,
  GEMINI_GLOBAL_LOCATION_MODELS,
} from "./vertexai-types";
import { resolveVertexModelId } from "./vertexai-types";
import { withVertexProvider, withVertexProviderStream, buildVertexAIForModel, getAccessToken, type ResolvedProvider } from "./vertexai-provider";
import { fetchWithOptionalProxy } from "./proxy-agent";

// ─────────────────────────────────────────────────────────────────────────────
// Gemini wire-format types
// ─────────────────────────────────────────────────────────────────────────────

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}

interface GeminiToolsConfig {
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    }>;
  }>;
  toolConfig?: {
    functionCallingConfig: {
      mode: "AUTO" | "ANY" | "NONE";
      allowedFunctionNames?: string[];
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversions: OpenAI <-> Gemini
// ─────────────────────────────────────────────────────────────────────────────

function partsFromContent(content: ChatMessage["content"]): GeminiPart[] {
  if (content === null) return [];
  if (typeof content === "string") return content ? [{ text: content }] : [];
  return content.map<GeminiPart>((p) =>
    "text" in p
      ? { text: p.text }
      : { inlineData: { mimeType: p.mimeType, data: p.base64 } },
  );
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    // Arrays are objects in JS (typeof [] === "object") but Gemini's functionResponse.response
    // must be a Struct (plain object), never a JSON array. Wrap arrays so Gemini accepts them.
    if (Array.isArray(parsed)) return { result: parsed };
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { value: parsed };
  } catch {
    return { value: s };
  }
}

/**
 * Splits and converts ChatMessage[] into:
 *   - systemInstruction (concatenated from any system messages)
 *   - contents (user/model turns including functionCall/functionResponse parts)
 *
 * Tool flow mapping:
 *   assistant message with tool_calls  → role: "model", parts: [functionCall, ...]
 *   tool message (role:"tool")         → role: "user",  parts: [functionResponse]
 */
function convertMessagesForGemini(messages: ChatMessage[]): {
  systemInstruction?: GeminiSystemInstruction;
  contents: GeminiContent[];
} {
  const systemTexts: string[] = [];
  const contents: GeminiContent[] = [];

  // Build a map of tool_call_id → function_name by scanning all model messages first.
  // n8n (and most OpenAI-compat clients) send tool results with only tool_call_id (no name).
  // Gemini requires functionResponse.name to exactly match the functionCall.name that triggered it.
  const toolCallIdToName: Record<string, string> = {};
  for (const m of messages) {
    if (m.role === "model" && m.tool_calls) {
      for (const tc of m.tool_calls) {
        if (tc.id && tc.function.name) toolCallIdToName[tc.id] = tc.function.name;
      }
    }
  }

  for (const m of messages) {
    if (m.role === "system") {
      const parts = partsFromContent(m.content);
      const text = parts.filter((p): p is { text: string } => "text" in p).map((p) => p.text).join("\n");
      if (text) systemTexts.push(text);
      continue;
    }

    if (m.role === "tool") {
      const responseObj = typeof m.content === "string"
        ? safeJsonParse(m.content)
        : { value: partsFromContent(m.content).filter((p): p is { text: string } => "text" in p).map((p) => p.text).join("") };
      // Resolve function name: prefer explicit name, then look up by tool_call_id, fallback to id itself
      const fnName = m.name
        || (m.tool_call_id ? toolCallIdToName[m.tool_call_id] : undefined)
        || m.tool_call_id
        || "tool_result";
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: fnName,
            response: responseObj,
          },
        }],
      });
      continue;
    }

    if (m.role === "model" && m.tool_calls && m.tool_calls.length) {
      const parts: GeminiPart[] = [];
      const textParts = partsFromContent(m.content);
      parts.push(...textParts);
      for (const tc of m.tool_calls) {
        parts.push({
          functionCall: {
            name: tc.function.name,
            args: safeJsonParse(tc.function.arguments || "{}"),
          },
        });
      }
      contents.push({ role: "model", parts });
      continue;
    }

    // Plain user or assistant text/multimodal turn.
    const parts = partsFromContent(m.content);
    if (parts.length === 0) continue;
    contents.push({ role: m.role === "model" ? "model" : "user", parts });
  }

  return {
    systemInstruction: systemTexts.length ? { parts: [{ text: systemTexts.join("\n") }] } : undefined,
    contents,
  };
}

/**
 * Gemini's function-calling API supports only a subset of JSON Schema.
 * Strip meta-fields that Gemini rejects (e.g. $schema, $id, additionalProperties).
 */
function sanitizeGeminiParameters(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!params) return undefined;

  const UNSUPPORTED = new Set([
    "$schema", "$id", "$ref", "$comment", "$defs",
    "additionalProperties", "exclusiveMinimum", "exclusiveMaximum",
    "not", "if", "then", "else", "allOf", "anyOf", "oneOf",
  ]);

  function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (UNSUPPORTED.has(k)) continue;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = sanitize(v as Record<string, unknown>);
      } else if (Array.isArray(v)) {
        out[k] = v.map((el) =>
          el && typeof el === "object" && !Array.isArray(el)
            ? sanitize(el as Record<string, unknown>)
            : el,
        );
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  return sanitize(params);
}

function buildGeminiToolsConfig(
  tools?: ToolDefinition[],
  toolChoice?: ToolChoice,
): GeminiToolsConfig {
  const out: GeminiToolsConfig = {};
  if (tools && tools.length) {
    out.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: sanitizeGeminiParameters(t.function.parameters),
      })),
    }];
  }
  if (toolChoice !== undefined) {
    if (toolChoice === "auto") {
      out.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    } else if (toolChoice === "none") {
      out.toolConfig = { functionCallingConfig: { mode: "NONE" } };
    } else if (toolChoice === "required") {
      out.toolConfig = { functionCallingConfig: { mode: "ANY" } };
    } else if (typeof toolChoice === "object" && toolChoice.type === "function") {
      out.toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: [toolChoice.function.name],
        },
      };
    }
  }
  return out;
}

function mapGeminiFinishReason(raw: string | null | undefined, hasToolCalls: boolean): FinishReason {
  if (hasToolCalls) return "tool_calls";
  switch (raw) {
    case "MAX_TOKENS": return "length";
    case "SAFETY":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII": return "content_filter";
    case "STOP":
    case null:
    case undefined: return "stop";
    default: return "stop";
  }
}

let toolCallCounter = 0;
function newToolCallId(): string {
  toolCallCounter = (toolCallCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `call_${Date.now().toString(36)}_${toolCallCounter}`;
}

interface GeminiCandidate {
  content?: { parts?: Array<Record<string, unknown>> };
  finishReason?: string;
}

function extractFromCandidate(candidate: GeminiCandidate | undefined): {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string | undefined;
} {
  const text: string[] = [];
  const toolCalls: ToolCall[] = [];
  const parts = candidate?.content?.parts ?? [];
  for (const p of parts) {
    if (typeof p["text"] === "string") text.push(p["text"] as string);
    const fc = p["functionCall"] as { name?: string; args?: Record<string, unknown> } | undefined;
    if (fc?.name) {
      toolCalls.push({
        id: newToolCallId(),
        type: "function",
        function: {
          name: fc.name,
          arguments: JSON.stringify(fc.args ?? {}),
        },
      });
    }
  }
  return { text: text.join(""), toolCalls, finishReason: candidate?.finishReason };
}

// ─────────────────────────────────────────────────────────────────────────────
// REST endpoint (used for global-location models AND whenever tools are present
// — keeps tool conversion logic in one place)
// ─────────────────────────────────────────────────────────────────────────────

function buildGeminiRestUrl(provider: ResolvedProvider, vertexModel: string, stream: boolean): string {
  const useGlobal = GEMINI_GLOBAL_LOCATION_MODELS.has(vertexModel);
  const loc = useGlobal ? "global" : (provider.location || "us-central1");
  const host = useGlobal ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  return (
    `https://${host}/v1/projects/${provider.projectId}` +
    `/locations/${loc}/publishers/google/models/${vertexModel}:${action}`
  );
}

// Instruction appended to systemInstruction when tools are available.
// Prevents Gemini from outputting text-based tool calls (e.g. ${toolCode} print(...))
// and ensures it always uses the native function calling mechanism.
const FUNCTION_CALLING_INSTRUCTION = `\n\n[TOOL CALLING RULES]
You have access to function tools. When you need to call a tool:
- ALWAYS use the native function calling mechanism (function call in structured format).
- NEVER output code strings, Python/JS code, or text like "\${toolCode}" to invoke tools.
- Call the function directly with the arguments extracted from the user message.`;

function buildGeminiRequestBody(messages: ChatMessage[], options?: ChatOptions): Record<string, unknown> {
  const { systemInstruction, contents } = convertMessagesForGemini(messages);
  const body: Record<string, unknown> = { contents };

  const hasTools = !!(options?.tools && options.tools.length);

  if (systemInstruction) {
    // When tools are present, append function-calling instruction to system prompt
    if (hasTools) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction.parts[0]?.text + FUNCTION_CALLING_INSTRUCTION }],
      };
    } else {
      body.systemInstruction = systemInstruction;
    }
  } else if (hasTools) {
    body.systemInstruction = { parts: [{ text: FUNCTION_CALLING_INSTRUCTION.trim() }] };
  }

  const config: Record<string, unknown> = {};
  if (options?.temperature !== undefined) config.temperature = options.temperature;
  if (options?.maxOutputTokens !== undefined) config.maxOutputTokens = options.maxOutputTokens;
  if (Object.keys(config).length) body.generationConfig = config;

  const toolsCfg = buildGeminiToolsConfig(options?.tools, options?.toolChoice);
  if (toolsCfg.tools) body.tools = toolsCfg.tools;
  // Always set toolConfig explicitly when tools are present and no override was given.
  // Without an explicit mode, Gemini may ignore tools and output text-based invocations.
  if (toolsCfg.toolConfig) {
    body.toolConfig = toolsCfg.toolConfig;
  } else if (hasTools) {
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }

  return body;
}

async function chatWithGeminiRest(
  provider: ResolvedProvider,
  vertexModel: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<ChatResult> {
  const token = await getAccessToken(provider);
  const url = buildGeminiRestUrl(provider, vertexModel, false);
  const body = buildGeminiRequestBody(messages, options);

  // DEBUG: log request body to diagnose tool-calling issues
  console.error("[GEMINI-DEBUG] model:", vertexModel);
  console.error("[GEMINI-DEBUG] tools in body:", JSON.stringify(body.tools ?? null));
  console.error("[GEMINI-DEBUG] toolConfig:", JSON.stringify((body as Record<string, unknown>).toolConfig ?? null));
  console.error("[GEMINI-DEBUG] systemInstruction:", JSON.stringify((body as Record<string, unknown>).systemInstruction ?? null).slice(0, 500));
  console.error("[GEMINI-DEBUG] contents count:", ((body as Record<string, unknown>).contents as unknown[])?.length);
  for (const m of messages) {
    const txt = typeof m.content === "string" ? m.content.slice(0, 200) : JSON.stringify(m.content).slice(0, 200);
    console.error(`[GEMINI-DEBUG] msg [${m.role}]:`, txt);
  }

  const response = await fetchWithOptionalProxy(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options?.signal,
  }, provider.proxyUrl);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${vertexModel} API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    candidates?: GeminiCandidate[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const { text, toolCalls, finishReason } = extractFromCandidate(data.candidates?.[0]);
  // DEBUG: log Gemini response summary
  console.error("[GEMINI-DEBUG] response finishReason:", finishReason);
  console.error("[GEMINI-DEBUG] response toolCalls:", toolCalls.length, toolCalls.map(tc => tc.function.name));
  console.error("[GEMINI-DEBUG] response text snippet:", text.slice(0, 100));
  return {
    content: text,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    finishReason: mapGeminiFinishReason(finishReason, toolCalls.length > 0),
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function* streamChatWithGeminiRest(
  provider: ResolvedProvider,
  vertexModel: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): AsyncGenerator<StreamEvent> {
  const token = await getAccessToken(provider);
  const url = buildGeminiRestUrl(provider, vertexModel, true);
  const body = buildGeminiRequestBody(messages, options);

  // DEBUG: log streaming request body
  console.error("[GEMINI-DEBUG-STREAM] model:", vertexModel);
  console.error("[GEMINI-DEBUG-STREAM] tools in body:", JSON.stringify(body.tools ?? null));
  console.error("[GEMINI-DEBUG-STREAM] toolConfig:", JSON.stringify((body as Record<string, unknown>).toolConfig ?? null));
  console.error("[GEMINI-DEBUG-STREAM] messages summary:", messages.map(m => ({
    role: m.role,
    hasToolCalls: !!(m.tool_calls?.length),
    hasToolCallId: !!m.tool_call_id,
  })));

  const response = await fetchWithOptionalProxy(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options?.signal,
  }, provider.proxyUrl);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${vertexModel} streaming error: ${response.status} ${err}`);
  }

  if (!response.body) throw new Error(`No response body from ${vertexModel} streaming`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let lastFinishReason: string | undefined;
  const accumulatedToolCalls: ToolCall[] = [];
  let toolCallStreamIndex = 0;

  try {
    while (true) {
      if (options?.signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        let chunk: Record<string, unknown>;
        try { chunk = JSON.parse(raw); } catch { continue; }

        const candidates = chunk["candidates"] as GeminiCandidate[] | undefined;
        if (candidates?.length) {
          const cand = candidates[0]!;
          const { text, toolCalls, finishReason } = extractFromCandidate(cand);
          if (text) yield { type: "delta", text };
          for (const tc of toolCalls) {
            const idx = toolCallStreamIndex++;
            accumulatedToolCalls.push(tc);
            yield {
              type: "tool_call_delta",
              index: idx,
              id: tc.id,
              name: tc.function.name,
              argumentsDelta: tc.function.arguments,
            };
          }
          if (finishReason) lastFinishReason = finishReason;
        }

        const usage = chunk["usageMetadata"] as Record<string, unknown> | undefined;
        if (usage) {
          inputTokens = (usage["promptTokenCount"] as number | undefined) ?? inputTokens;
          outputTokens = (usage["candidatesTokenCount"] as number | undefined) ?? outputTokens;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  yield {
    type: "done",
    inputTokens,
    outputTokens,
    finishReason: mapGeminiFinishReason(lastFinishReason, accumulatedToolCalls.length > 0),
    toolCalls: accumulatedToolCalls.length ? accumulatedToolCalls : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SDK path (regional, no tools) — kept for backwards compat for the simple
// non-tool case on regional Gemini models.
// ─────────────────────────────────────────────────────────────────────────────

function shouldUseRest(vertexModel: string, options?: ChatOptions): boolean {
  // Always use REST for global-location models or when tools are involved.
  if (GEMINI_GLOBAL_LOCATION_MODELS.has(vertexModel)) return true;
  if (options?.tools && options.tools.length) return true;
  return false;
}

export async function chatWithGemini(
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<ChatResult> {
  return withVertexProvider(async (provider) => {
    const vertexModel = resolveVertexModelId(model);

    if (shouldUseRest(vertexModel, options)) {
      return chatWithGeminiRest(provider, vertexModel, messages, options);
    }

    const vertexAI = buildVertexAIForModel(provider, vertexModel);
    const generativeModel = vertexAI.getGenerativeModel({
      model: vertexModel,
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxOutputTokens,
      },
    });

    function msgToParts(msg: ChatMessage) {
      if (msg.content === null) return [];
      if (typeof msg.content === "string") return [{ text: msg.content }];
      return msg.content.map((p) =>
        "text" in p
          ? { text: p.text }
          : { inlineData: { mimeType: p.mimeType, data: p.base64 } },
      );
    }

    // Filter out system/tool messages — SDK path is the no-tools case.
    const turns = messages.filter((m) => m.role === "user" || m.role === "model");
    const history = turns.slice(0, -1).map((m) => ({
      role: m.role,
      parts: msgToParts(m),
    }));

    const lastMessage = turns[turns.length - 1];
    if (!lastMessage) throw new Error("No messages provided");

    const chat = generativeModel.startChat({ history });
    const result = await chat.sendMessage(msgToParts(lastMessage));
    const response = result.response;
    const content = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const usage = response.usageMetadata;

    return {
      content,
      finishReason: "stop",
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
    };
  });
}

export async function* streamChatWithGemini(
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): AsyncGenerator<StreamEvent> {
  const it = await withVertexProviderStream<StreamEvent>(async (provider) => {
    const vertexModel = resolveVertexModelId(model);

    if (shouldUseRest(vertexModel, options)) {
      return streamChatWithGeminiRest(provider, vertexModel, messages, options);
    }

    const vertexAI = buildVertexAIForModel(provider, vertexModel);
    const generativeModel = vertexAI.getGenerativeModel({
      model: vertexModel,
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxOutputTokens,
      },
    });

    function msgToParts(msg: ChatMessage) {
      if (msg.content === null) return [];
      if (typeof msg.content === "string") return [{ text: msg.content }];
      return msg.content.map((p) =>
        "text" in p
          ? { text: p.text }
          : { inlineData: { mimeType: p.mimeType, data: p.base64 } },
      );
    }

    const turns = messages.filter((m) => m.role === "user" || m.role === "model");
    const history = turns.slice(0, -1).map((m) => ({
      role: m.role,
      parts: msgToParts(m),
    }));

    const lastMessage = turns[turns.length - 1];
    if (!lastMessage) throw new Error("No messages provided");

    const chat = generativeModel.startChat({ history });
    const streamResult = await chat.sendMessageStream(msgToParts(lastMessage));

    return (async function* (): AsyncGenerator<StreamEvent> {
      for await (const chunk of streamResult.stream) {
        if (options?.signal?.aborted) break;
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) yield { type: "delta", text };
      }
      const finalResponse = await streamResult.response;
      const usage = finalResponse.usageMetadata;
      yield {
        type: "done",
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        finishReason: "stop",
      };
    })();
  });
  yield* it;
}

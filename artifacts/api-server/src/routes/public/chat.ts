import { Router, type IRouter } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";

const router: IRouter = Router();

const chatRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "") + ":public-chat",
  message: { error: "Too many messages. Please wait a few minutes." },
});

const SYSTEM_PROMPT = `أنت مساعد ذكي لمنصة "AI Gateway" — بوابة وصول موحّدة لنماذج الذكاء الاصطناعي.

**ما هي المنصة؟**
AI Gateway هي منصة SaaS (خدمة كـ برنامج) تمنح المطورين والشركات وصولاً فورياً لأقوى نماذج الذكاء الاصطناعي عبر API واحد موحّد، مع نظام فوترة مرن ولوحة تحكم متقدمة.

**النماذج المتاحة (25+ نموذج):**
- Google Vertex AI: Gemini 2.5 Pro/Flash، Imagen 3 (توليد صور)، Veo 2 (توليد فيديو)
- OpenAI: GPT-4o، GPT-4 Turbo، o1، o3، DALL-E 3، Whisper، TTS
- Anthropic: Claude 3.5 Sonnet، Claude 3 Opus/Haiku
- Mistral: Mistral Large، Mistral 7B
- Meta: Llama 3.1 (405B، 70B، 8B)
- Groq: سرعة استجابة < 100ms
- DeepSeek، Grok (xAI)

**المميزات الرئيسية:**
- 🔑 مفتاح API واحد للوصول لجميع النماذج
- 💰 تسعير بهامش 1.1× (فقط 10% فوق سعر التكلفة)
- 📊 لوحة تحليلات متقدمة: استخدام، تكاليف، سجل طلبات
- ⚡ وقت استجابة < 100ms مع uptime 99.9%
- 🌍 دعم كامل لعربي وإنجليزي
- 💳 شحن رصيد بالدينار الجزائري (DZD) عبر Chargily Pay V2
- 🎁 برنامج إحالة: كسب رصيد عند دعوة أصدقاء
- 🏢 دعم المؤسسات والفرق (Organizations)
- 🔒 مصادقة ثنائية (2FA)، HTTPS، تشفير كامل

**الخطط:**
- خطة مجانية: للتجربة والبدء
- خطط مدفوعة: رصيد شهري بأسعار تنافسية، مع تنبيهات انخفاض الرصيد

**كيف يعمل؟**
1. سجّل حساباً مجانياً
2. احصل على مفتاح API
3. استخدم أي نموذج بنفس الـ endpoint
4. اشحن رصيد بالدينار الجزائري عند الحاجة

**قواعد الردّ:**
- اردّ بنفس لغة المستخدم (عربي أو إنجليزي)
- اجعل ردودك مختصرة وودية
- إذا سأل عن أسعار محددة، وجّهه لصفحة الأسعار في الموقع
- إذا كان لديه مشكلة تقنية، وجّهه للتوثيق أو فريق الدعم
- لا تختلق أرقاماً أو معلومات غير موجودة في هذه القائمة`;

const MessageSchema = z.object({
  role: z.enum(["user", "model"]),
  text: z.string().max(4000),
});

const ChatBody = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
});

router.post("/public/chat", chatRateLimit, async (req, res): Promise<void> => {
  if (
    !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
    !process.env.AI_INTEGRATIONS_GEMINI_API_KEY
  ) {
    res.status(503).json({ error: "Chat feature is not configured." });
    return;
  }

  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { messages } = parsed.data;

  try {
    const { ai } = await import("@workspace/integrations-gemini-ai");

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role as "user" | "model",
      parts: [{ text: m.text }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 512 },
      history,
    });

    const response = await chat.sendMessage({
      message: lastMessage.text,
    });

    const text = response.text ?? "";
    res.json({ reply: text });
  } catch (err) {
    console.error("[public/chat] Gemini error:", err);
    res.status(500).json({ error: "Failed to get response. Please try again." });
  }
});

export default router;

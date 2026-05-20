export function VariantB() {
  return (
    <div dir="rtl" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
      className="min-h-screen bg-[#f8f8ff] text-zinc-900 overflow-x-hidden">

      {/* ─── Urgency bar ─── */}
      <div style={{ background: "linear-gradient(90deg, #fef3c7, #fde68a, #fef3c7)", borderBottom: "1px solid #f59e0b30" }}
        className="text-center py-2.5 text-sm font-medium text-amber-800">
        ⏳&nbsp; عرض محدود — أول 100 مستخدم يحصلون على <strong>رصيد إضافي مجاني</strong>
      </div>

      {/* ─── Header ─── */}
      <header style={{ backdropFilter: "blur(20px)", background: "rgba(248,248,255,0.9)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
        className="sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", borderRadius: 10 }} className="p-2 shadow-lg shadow-indigo-500/25">
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <span className="font-bold text-[15px]">AI Gateway</span>
          </div>
          <nav className="hidden md:flex gap-8 text-sm text-zinc-500">
            {["المميزات","النماذج","الأسعار","التوثيق"].map(n => (
              <a key={n} href="#" className="hover:text-zinc-900 transition-colors">{n}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors px-3 py-1.5">تسجيل الدخول</button>
            <button style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 4px 20px rgba(79,70,229,0.35)" }}
              className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
              ابدأ مجاناً ←
            </button>
          </div>
        </div>
      </header>

      {/* ─── Hero — Split ─── */}
      <section className="relative px-6 pt-16 pb-24 overflow-hidden">

        {/* Soft bg blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div style={{ background: "radial-gradient(ellipse 60% 50% at 90% 30%, rgba(79,70,229,0.08) 0%, transparent 70%)" }} className="absolute inset-0" />
          <div style={{ background: "radial-gradient(ellipse 50% 40% at 10% 80%, rgba(124,58,237,0.06) 0%, transparent 70%)" }} className="absolute inset-0" />
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative">

          {/* ── Text side ── */}
          <div>
            <div style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 999 }}
              className="inline-flex items-center gap-2.5 px-4 py-1.5 mb-7">
              <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" />
              <span className="text-sm text-indigo-700 font-medium">مدعوم بـ Google Vertex AI</span>
            </div>

            <h1 className="text-[clamp(2rem,5vw,3.6rem)] font-black leading-[1.1] tracking-tight mb-6">
              <span style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                كل نماذج الذكاء الاصطناعي
              </span>
              <br />
              <span className="text-zinc-900">بمفتاح API واحد</span>
            </h1>

            <p className="text-[1.05rem] text-zinc-500 mb-8 leading-relaxed max-w-lg">
              Gemini, Claude, GPT-4o, DeepSeek, Llama والمزيد —
              فوترة بالدينار الجزائري، تحليلات متقدمة، دعم كامل للعربية.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-7">
              <button style={{
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                boxShadow: "0 8px 32px rgba(79,70,229,0.4)"
              }} className="text-white font-bold px-8 py-4 rounded-2xl text-base hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2">
                أنشئ حسابك المجاني ←
              </button>
              <button style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
                className="text-zinc-600 hover:text-zinc-900 font-medium px-8 py-4 rounded-2xl text-base transition-colors inline-flex items-center justify-center gap-2">
                اطلع على التوثيق
              </button>
            </div>
            <p className="text-zinc-400 text-sm mb-10">لا بطاقة ائتمان · لا التزام</p>

            {/* Social proof */}
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }} className="pt-8 flex items-center gap-4">
              <div className="flex -space-x-2.5 space-x-reverse">
                {[
                  "from-indigo-400 to-violet-500",
                  "from-blue-400 to-cyan-400",
                  "from-emerald-400 to-teal-400",
                  "from-orange-400 to-rose-400",
                  "from-pink-400 to-fuchsia-500",
                ].map((g, i) => (
                  <div key={i} className={`w-9 h-9 rounded-full bg-gradient-to-br ${g} border-2 border-[#f8f8ff] shadow-sm flex items-center justify-center text-sm`}>
                    {["🧑‍💻","👩‍💻","🧑‍💼","👩‍🔬","🧑‍🎨"][i]}
                  </div>
                ))}
              </div>
              <div>
                <div className="flex text-amber-400 text-sm mb-0.5">{"★".repeat(5)}</div>
                <p className="text-zinc-400 text-sm"><strong className="text-zinc-800">500+ مطور</strong> يثقون بالمنصة</p>
              </div>
            </div>
          </div>

          {/* ── Code card ── */}
          <div>
            <div style={{
              background: "#0d0d1a",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.2), 0 0 0 1px rgba(79,70,229,0.15)"
            }} className="rounded-2xl overflow-hidden">
              {/* Tab bar */}
              <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}
                className="flex items-center gap-1.5 px-5 pt-4 pb-3">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <span className="text-white/25 text-xs mr-4 font-mono">chat_example.py</span>
              </div>
              {/* Code */}
              <div className="p-6">
                <pre dir="ltr" style={{ color: "#e2e8f0", fontSize: "0.82rem", lineHeight: 1.7 }}
                  className="font-mono overflow-x-auto">{`import requests

response = requests.post(
    "https://picindexer.site/v1/chat",
    headers={
        "Authorization": "Bearer sk-xxxx",
    },
    json={
        "model": "gemini-2.5-flash",
        "messages": [
            {"role": "user",
             "content": "مرحباً!"}
        ]
    }
)

print(response.json()
      ["choices"][0]["message"])`}</pre>
              </div>
              {/* Response preview */}
              <div className="px-6 pb-5">
                <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 12 }}
                  className="px-4 py-3 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <code style={{ color: "#34d399", fontSize: "0.78rem" }} className="font-mono">
                    {"{ message: 'مرحباً! كيف يمكنني مساعدتك؟' }"}
                  </code>
                </div>
              </div>
            </div>

            {/* Floating stat pills */}
            <div className="flex gap-3 mt-4 justify-center flex-wrap">
              {[
                { icon: "⚡", l: "< 100ms استجابة", c: "#d1fae5", b: "#059669" },
                { icon: "🔒", l: "HTTPS + تشفير", c: "#dbeafe", b: "#2563eb" },
                { icon: "🌍", l: "دعم عربي كامل", c: "#ede9fe", b: "#7c3aed" },
              ].map(p => (
                <div key={p.l} style={{ background: p.c, border: `1px solid ${p.b}25` }}
                  className="rounded-full px-4 py-2 flex items-center gap-2 shadow-sm">
                  <span className="text-sm">{p.icon}</span>
                  <span style={{ color: p.b, fontSize: "0.78rem" }} className="font-semibold">{p.l}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ─── Logos ─── */}
      <div style={{ background: "#f1f0ff", borderTop: "1px solid rgba(79,70,229,0.08)", borderBottom: "1px solid rgba(79,70,229,0.08)" }}
        className="py-8 px-6">
        <p className="text-center text-zinc-400 text-xs uppercase tracking-widest mb-5">يدعم أقوى نماذج الذكاء الاصطناعي العالمية</p>
        <div className="flex flex-wrap justify-center gap-8 max-w-4xl mx-auto">
          {["Gemini","GPT-4o","Claude 3.5","DeepSeek","Llama 3","Grok","Mistral","Imagen"].map(m => (
            <span key={m} className="font-bold text-sm text-zinc-300 hover:text-indigo-500 transition-colors cursor-default">{m}</span>
          ))}
        </div>
      </div>

      {/* ─── Free features grid ─── */}
      <section style={{ background: "linear-gradient(180deg, #f8f8ff 0%, #eef2ff 100%)" }} className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">

          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 999 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 mb-6">
            <span className="text-green-600 font-bold text-sm">✓ مجاناً — لا حدود زمنية</span>
          </div>

          <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] font-black mb-4 text-zinc-900">ما الذي تحصل عليه مجاناً؟</h2>
          <p className="text-zinc-500 mb-12 text-base">سجّل الآن واحصل على كل هذا — مجاناً وللأبد</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {[
              { icon: "🤖", t: "25+ نموذج AI", d: "Gemini, GPT-4o, Claude, DeepSeek والمزيد" },
              { icon: "⚡", t: "مفتاح API في ثوانٍ", d: "جاهز للاستخدام فور التسجيل" },
              { icon: "💳", t: "شحن بالدينار الجزائري", d: "عبر Chargily Pay — بدون بطاقة أجنبية" },
              { icon: "📊", t: "تحليلات مفصّلة", d: "استخدامك وتكاليفك وسجل طلباتك" },
              { icon: "🔒", t: "أمان تام", d: "HTTPS + تشفير + مصادقة ثنائية" },
              { icon: "🎁", t: "برنامج إحالة", d: "ادعُ أصدقاءك واحصل على رصيد مجاني" },
            ].map(item => (
              <div key={item.t} style={{
                background: "white",
                border: "1px solid rgba(0,0,0,0.06)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.04)"
              }} className="rounded-2xl p-6 text-right hover:shadow-lg hover:border-indigo-200 transition-all">
                <div className="text-3xl mb-3">{item.icon}</div>
                <div className="font-bold text-zinc-900 mb-1">{item.t}</div>
                <div className="text-zinc-500 text-sm leading-relaxed">{item.d}</div>
              </div>
            ))}
          </div>

          <button style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            boxShadow: "0 12px 40px rgba(79,70,229,0.4)"
          }} className="text-white font-black px-14 py-4 rounded-2xl text-lg hover:opacity-90 transition-opacity">
            سجّل مجاناً الآن ←
          </button>
          <p className="text-zinc-400 text-sm mt-3">لا بطاقة ائتمان · لا التزام · ابدأ في أقل من دقيقة</p>
        </div>
      </section>

    </div>
  );
}

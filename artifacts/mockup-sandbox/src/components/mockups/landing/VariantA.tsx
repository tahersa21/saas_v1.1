export function VariantA() {
  return (
    <div dir="rtl" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
      className="min-h-screen bg-[#060610] text-white overflow-x-hidden">

      {/* ─── Top bar ─── */}
      <div style={{ background: "linear-gradient(90deg, #7c3aed, #4f46e5, #7c3aed)" }}
        className="text-center py-2.5 text-sm font-medium text-white/90">
        🎉&nbsp; أول 100 مستخدم يحصلون على <strong>رصيد مجاني إضافي</strong> عند التسجيل
      </div>

      {/* ─── Header ─── */}
      <header className="border-b border-white/[0.06] sticky top-0 z-50"
        style={{ backdropFilter: "blur(20px)", background: "rgba(6,6,16,0.85)" }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", borderRadius: 10 }}
              className="p-2 shadow-lg shadow-violet-900/40">
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-[15px] text-white">AI Gateway</span>
          </div>
          <nav className="hidden md:flex gap-8 text-sm text-white/50">
            {["المميزات","النماذج","الأسعار","التوثيق"].map(n => (
              <a key={n} href="#" className="hover:text-white/90 transition-colors">{n}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button className="text-sm text-white/50 hover:text-white transition-colors px-3 py-1.5">تسجيل الدخول</button>
            <button style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
              className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl shadow-lg shadow-violet-900/40 hover:opacity-90 transition-opacity">
              ابدأ مجاناً ←
            </button>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative min-h-[88vh] flex items-center pt-10 pb-24 px-6 overflow-hidden">

        {/* Aurora background */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div style={{
            background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,58,237,0.35) 0%, transparent 70%)"
          }} className="absolute inset-0" />
          <div style={{
            background: "radial-gradient(ellipse 60% 40% at 80% 50%, rgba(79,70,229,0.2) 0%, transparent 60%)"
          }} className="absolute inset-0" />
          <div style={{
            background: "radial-gradient(ellipse 50% 30% at 10% 70%, rgba(139,92,246,0.15) 0%, transparent 60%)"
          }} className="absolute inset-0" />
          {/* Grid */}
          <div style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px"
          }} className="absolute inset-0" />
        </div>

        <div className="max-w-5xl mx-auto w-full relative text-center">

          {/* Live badge */}
          <div style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(12px)"
          }} className="inline-flex items-center gap-2.5 rounded-full px-5 py-2 mb-10">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50" style={{ animation: "pulse 2s infinite" }} />
            <span className="text-sm text-white/60">مدعوم بـ Google Vertex AI — متاح الآن</span>
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(2.5rem,8vw,5.5rem)] font-black leading-[1.05] tracking-tight mb-7">
            <span style={{
              background: "linear-gradient(135deg, #c4b5fd 0%, #818cf8 40%, #6ee7b7 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>كل نماذج الذكاء الاصطناعي</span>
            <br />
            <span className="text-white">بمفتاح API واحد</span>
          </h1>

          <p className="text-[1.15rem] text-white/55 mb-10 max-w-2xl mx-auto leading-relaxed">
            وصّل تطبيقك بـ <strong className="text-white/80">25+ نموذج AI</strong> — Gemini, GPT-4o, Claude, DeepSeek —
            فوترة بالدينار الجزائري، استجابة أقل من 100ms.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-4 justify-center mb-5">
            <button style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              boxShadow: "0 8px 40px rgba(124,58,237,0.45), 0 0 0 1px rgba(124,58,237,0.3)"
            }} className="text-white font-bold px-9 py-4 rounded-2xl text-base hover:opacity-90 transition-opacity inline-flex items-center gap-2">
              ابدأ مجاناً الآن ←
            </button>
            <button style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)"
            }} className="text-white/70 hover:text-white font-medium px-9 py-4 rounded-2xl text-base transition-colors inline-flex items-center gap-2">
              اطلع على التوثيق
            </button>
          </div>
          <p className="text-white/30 text-sm mb-16">لا بطاقة ائتمان · لا التزام · ابدأ في 60 ثانية</p>

          {/* Social proof */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-20">
            <div className="flex -space-x-3 space-x-reverse">
              {[
                "bg-gradient-to-br from-violet-400 to-fuchsia-500",
                "bg-gradient-to-br from-blue-400 to-cyan-500",
                "bg-gradient-to-br from-emerald-400 to-teal-500",
                "bg-gradient-to-br from-orange-400 to-rose-500",
                "bg-gradient-to-br from-pink-400 to-violet-500",
              ].map((g, i) => (
                <div key={i} className={`w-10 h-10 rounded-full ${g} border-2 border-[#060610] shadow-lg flex items-center justify-center text-base`}>
                  {["🧑‍💻","👩‍💻","🧑‍💼","👩‍🔬","🧑‍🎨"][i]}
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              className="rounded-full px-4 py-2 flex items-center gap-3">
              <div className="flex text-amber-400 text-sm">{"★".repeat(5)}</div>
              <span className="text-white/50 text-sm"><strong className="text-white/80">500+</strong> مطور يثقون بالمنصة</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { v: "25+", u: "نموذج AI", c: "#a78bfa" },
              { v: "<100ms", u: "زمن الاستجابة", c: "#34d399" },
              { v: "99.9%", u: "وقت التشغيل", c: "#60a5fa" },
              { v: "×1.1", u: "هامش التسعير فقط", c: "#fb923c" },
            ].map(s => (
              <div key={s.u} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                backdropFilter: "blur(12px)",
              }} className="rounded-2xl p-6">
                <div style={{ color: s.c }} className="text-3xl font-black mb-1">{s.v}</div>
                <div className="text-white/40 text-sm">{s.u}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Model logos ─── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)" }}
        className="py-8 px-6">
        <p className="text-center text-white/20 text-xs uppercase tracking-widest mb-6">يدعم أقوى نماذج الذكاء الاصطناعي العالمية</p>
        <div className="flex flex-wrap items-center justify-center gap-8 max-w-4xl mx-auto">
          {["Gemini","GPT-4o","Claude 3.5","DeepSeek","Llama 3","Grok","Mistral","Imagen"].map(m => (
            <span key={m} className="text-white/20 font-bold text-sm tracking-wide hover:text-white/50 transition-colors cursor-default">{m}</span>
          ))}
        </div>
      </div>

      {/* ─── Free tier card ─── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(79,70,229,0.08) 100%)",
            border: "1px solid rgba(124,58,237,0.25)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 0 80px rgba(124,58,237,0.12)"
          }} className="rounded-3xl p-10 text-center">
            <div className="text-5xl mb-5">🎁</div>
            <h2 className="text-2xl font-bold mb-3">ما الذي تحصل عليه مجاناً؟</h2>
            <p className="text-white/50 mb-10">سجّل الآن واحصل على كل هذا — بلا حدود زمنية</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
              {[
                { icon: "🤖", t: "25+ نموذج AI", s: "Gemini · GPT · Claude وغيرها" },
                { icon: "⚡", t: "مفتاح API فوري", s: "جاهز في أقل من دقيقة" },
                { icon: "📊", t: "لوحة تحليلات", s: "رصد الاستخدام والتكاليف" },
              ].map(i => (
                <div key={i.t} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  className="rounded-2xl p-5">
                  <div className="text-3xl mb-3">{i.icon}</div>
                  <div className="font-semibold text-white/90 text-sm mb-1">{i.t}</div>
                  <div className="text-white/35 text-xs">{i.s}</div>
                </div>
              ))}
            </div>

            <button style={{
              background: "white",
              color: "#4c1d95",
              boxShadow: "0 8px 30px rgba(255,255,255,0.15)"
            }} className="font-black px-12 py-4 rounded-2xl text-base hover:opacity-90 transition-opacity">
              أنشئ حسابك المجاني ←
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}

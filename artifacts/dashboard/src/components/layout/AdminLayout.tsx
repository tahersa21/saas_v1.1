import { ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Key, BarChart3, Settings, LogOut, Cloud,
  Moon, Sun, Languages, DollarSign, Shield, Tag, SlidersHorizontal,
  AlertTriangle, Gift, Activity, Zap, CreditCard, Menu, X, Megaphone,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AdminLayout({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const isAr = i18n.language === "ar";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: t("nav.dashboard"),   href: "/admin",              icon: LayoutDashboard, exact: true },
    { name: t("nav.developers"),  href: "/admin/developers",   icon: Users,           exact: false },
    { name: t("nav.apiKeys"),     href: "/admin/api-keys",     icon: Key,             exact: false },
    { name: t("nav.analytics"),   href: "/admin/analytics",    icon: BarChart3,       exact: false },
    { name: isAr ? "فحص الزيارات" : "Traffic", href: "/admin/traffic", icon: Activity, exact: false },
    { name: t("nav.plans"),       href: "/admin/plans",        icon: Settings,        exact: false },
    { name: t("nav.providers"),   href: "/admin/providers",    icon: Cloud,           exact: false },
    { name: t("nav.pricing"),     href: "/admin/pricing",      icon: DollarSign,      exact: false },
    { name: "Audit Log",          href: "/admin/audit-log",    icon: Shield,          exact: false },
    { name: t("nav.promoCodes"),  href: "/admin/promo-codes",  icon: Tag,             exact: false },
    { name: isAr ? "الإحالة" : "Referrals", href: "/admin/referrals", icon: Gift,    exact: false },
    { name: t("nav.incidents") || "Incidents", href: "/admin/incidents", icon: AlertTriangle, exact: false },
    { name: isAr ? "المدفوعات" : "Payments",  href: "/admin/payments",  icon: CreditCard,      exact: false },
    { name: isAr ? "إشعارات المنصة" : "Announcements", href: "/admin/announcements", icon: Megaphone, exact: false },
    { name: "Settings",           href: "/admin/settings",     icon: SlidersHorizontal, exact: false },
  ];

  const handleLogout = async () => {
    await logout("admin");
    navigate("/admin/login");
  };

  const switchLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("lang", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div
        className="h-16 flex items-center gap-3 px-5 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ background: "linear-gradient(135deg,#00FFE0,#00b3a0)" }}
        >
          <Zap className="h-4 w-4" style={{ color: "#050508" }} />
        </div>
        <span className="font-black text-white text-sm" style={{ fontFamily: "'Space Mono', monospace" }}>
          AI Gateway
        </span>
        <span
          className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(79,70,229,0.2)", color: "#818cf8", fontFamily: "'Space Mono', monospace" }}
        >
          ADMIN
        </span>
        {/* Close button on mobile */}
        <button
          className="md:hidden p-1 rounded-lg ml-1"
          style={{ color: "rgba(255,255,255,0.4)" }}
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navigation.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.exact}
            className="block"
            onClick={() => setSidebarOpen(false)}
          >
            {({ isActive }) => (
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isAr ? "flex-row-reverse" : ""}`}
                style={{
                  background: isActive ? "rgba(0,255,224,0.08)" : "transparent",
                  color: isActive ? "#00FFE0" : "rgba(255,255,255,0.4)",
                  borderLeft: isActive && !isAr ? "2px solid #00FFE0" : "2px solid transparent",
                  borderRight: isActive && isAr ? "2px solid #00FFE0" : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.color = "rgba(255,255,255,0.75)"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.color = "rgba(255,255,255,0.4)"; }}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.name}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="p-4 space-y-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className={`flex items-center gap-1 ${isAr ? "flex-row-reverse" : ""}`}>
          <button
            onClick={toggle}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 rounded-lg transition-colors"
                style={{ color: "rgba(255,255,255,0.35)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
              >
                <Languages className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isAr ? "end" : "start"} style={{ background: "#1a1a28", border: "1px solid rgba(255,255,255,0.1)" }}>
              <DropdownMenuItem onClick={() => switchLang("en")} className={i18n.language === "en" ? "font-bold" : ""} style={{ color: "rgba(255,255,255,0.7)" }}>
                🇺🇸 {t("language.en")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => switchLang("ar")} className={i18n.language === "ar" ? "font-bold" : ""} style={{ color: "rgba(255,255,255,0.7)" }}>
                🇩🇿 {t("language.ar")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 text-xs font-bold"
            style={{ background: "rgba(79,70,229,0.2)", color: "#818cf8" }}
          >
            {user?.email?.[0]?.toUpperCase() ?? "A"}
          </div>
          <span
            className="text-xs truncate flex-1"
            style={{ color: "rgba(255,255,255,0.35)" }}
            title={user?.email}
          >
            {user?.email}
          </span>
          <button
            onClick={handleLogout}
            title={t("auth.signOut")}
            className="p-1.5 rounded-lg transition-colors shrink-0"
            style={{ color: "rgba(255,255,255,0.25)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`flex h-screen ${isAr ? "flex-row-reverse" : ""}`}
      style={{ background: "#07070f", fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar desktop ── */}
      <aside
        className="hidden md:flex w-60 flex-col shrink-0"
        style={{
          background: "#0d0d1a",
          borderRight: isAr ? "none" : "1px solid rgba(255,255,255,0.06)",
          borderLeft: isAr ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Sidebar mobile drawer ── */}
      <aside
        className={`fixed top-0 ${isAr ? "right-0" : "left-0"} h-full w-64 flex flex-col z-50 md:hidden transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : isAr ? "translate-x-full" : "-translate-x-full"
        }`}
        style={{
          background: "#0d0d1a",
          borderRight: isAr ? "none" : "1px solid rgba(255,255,255,0.06)",
          borderLeft: isAr ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 h-14 shrink-0"
          style={{ background: "#0d0d1a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ background: "linear-gradient(135deg,#00FFE0,#00b3a0)" }}
          >
            <Zap className="h-3.5 w-3.5" style={{ color: "#050508" }} />
          </div>
          <span className="font-black text-white text-sm" style={{ fontFamily: "'Space Mono', monospace" }}>
            AI Gateway
          </span>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(79,70,229,0.2)", color: "#818cf8", fontFamily: "'Space Mono', monospace" }}
          >
            ADMIN
          </span>
        </div>

        <main
          className="flex-1 overflow-y-auto p-4 md:p-8"
          style={{ background: "#07070f" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

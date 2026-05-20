import { ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Activity, Key, CreditCard, BookOpen, LogOut,
  Moon, Sun, Languages, Settings, Webhook, FileText, Users, Wallet, Gift, Zap, Menu, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

export function PortalLayout({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const isAr = i18n.language === "ar";
  const isDark = theme === "dark";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [hideOrganizations, setHideOrganizations] = useState<boolean>(() => {
    const cached = localStorage.getItem("ui_hide_organizations");
    return cached === "true";
  });

  useEffect(() => {
    const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${apiBase}/api/public/ui-flags`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ hideOrganizations?: boolean }>) : null))
      .then((data) => {
        if (!data) return;
        const v = Boolean(data.hideOrganizations);
        setHideOrganizations(v);
        localStorage.setItem("ui_hide_organizations", v ? "true" : "false");
      })
      .catch(() => {});
  }, []);

  const navigation = [
    { name: t("nav.dashboard"),                  href: "/portal",              icon: LayoutDashboard, exact: true },
    { name: t("nav.apiKeys") || "API Keys",      href: "/portal/api-keys",    icon: Key,             exact: false },
    { name: t("nav.plans") || "Plans",           href: "/portal/plans",       icon: CreditCard,      exact: false },
    { name: isAr ? "شحن الرصيد" : "Top up",     href: "/portal/billing",     icon: Wallet,          exact: false },
    { name: isAr ? "الإحالة" : "Referrals",     href: "/portal/referrals",   icon: Gift,            exact: false },
    { name: t("nav.usage"),                       href: "/portal/usage",       icon: Activity,        exact: false },
    { name: "Webhooks",                           href: "/portal/webhooks",    icon: Webhook,         exact: false },
    { name: "Logs",                               href: "/portal/logs",        icon: FileText,        exact: false },
    ...(hideOrganizations
      ? []
      : [{ name: t("nav.organizations") || "Organizations", href: "/portal/organizations", icon: Users, exact: false }]),
    { name: t("nav.docs") || "Docs",             href: "/portal/docs",        icon: BookOpen,        exact: false },
    { name: "Settings",                           href: "/portal/settings",    icon: Settings,        exact: false },
  ];

  const handleLogout = async () => {
    await logout("developer");
    navigate("/login");
  };

  const switchLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("lang", lang);
    document.documentElement.dir = "ltr";
    document.documentElement.lang = lang;
  };

  const sidebarBg    = isDark ? "#0d0d1a"   : "#ffffff";
  const mainBg       = isDark ? "#07070f"   : "#f4f6fb";
  const sidebarBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const navActiveColor   = isDark ? "#00FFE0" : "#0f766e";
  const navActiveBg      = isDark ? "rgba(0,255,224,0.08)"  : "rgba(15,118,110,0.08)";
  const navInactiveColor = isDark ? "rgba(255,255,255,0.4)" : "rgba(30,30,30,0.5)";
  const navHoverColor    = isDark ? "rgba(255,255,255,0.75)" : "rgba(30,30,30,0.9)";
  const logoTextColor    = isDark ? "#ffffff" : "#111827";
  const devBadgeBg       = isDark ? "rgba(0,255,224,0.1)"  : "rgba(15,118,110,0.1)";
  const devBadgeColor    = isDark ? "#00FFE0" : "#0f766e";
  const footerTextColor  = isDark ? "rgba(255,255,255,0.35)" : "rgba(30,30,30,0.45)";
  const avatarBg         = isDark ? "rgba(0,255,224,0.12)" : "rgba(15,118,110,0.12)";
  const avatarColor      = isDark ? "#00FFE0" : "#0f766e";
  const dropdownBg       = isDark ? "#1a1a28" : "#ffffff";
  const dropdownBorder   = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)";
  const dropdownTextColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(30,30,30,0.8)";
  const topBarBg         = isDark ? "#0d0d1a" : "#ffffff";
  const menuBtnColor     = isDark ? "rgba(255,255,255,0.6)" : "rgba(30,30,30,0.6)";

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div
        className="h-16 flex items-center gap-3 px-5 shrink-0"
        style={{ borderBottom: `1px solid ${sidebarBorder}` }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ background: "linear-gradient(135deg,#00FFE0,#00b3a0)" }}
        >
          <Zap className="h-4 w-4" style={{ color: "#050508" }} />
        </div>
        <span className="font-black text-sm" style={{ fontFamily: "'Space Mono', monospace", color: logoTextColor }}>
          AI Gateway
        </span>
        <span
          className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ background: devBadgeBg, color: devBadgeColor, fontFamily: "'Space Mono', monospace" }}
        >
          DEV
        </span>
        {/* Close button on mobile */}
        <button
          className="md:hidden p-1 rounded-lg ml-1"
          style={{ color: footerTextColor }}
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: isActive ? navActiveBg : "transparent",
                  color: isActive ? navActiveColor : navInactiveColor,
                  borderLeft: isActive ? `2px solid ${navActiveColor}` : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.color = navHoverColor; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.color = navInactiveColor; }}
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
        style={{ borderTop: `1px solid ${sidebarBorder}` }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={toggle}
            title={isDark ? "Light mode" : "Dark mode"}
            className="p-2 rounded-lg transition-colors"
            style={{ color: footerTextColor }}
            onMouseEnter={e => (e.currentTarget.style.color = isDark ? "#fff" : "#000")}
            onMouseLeave={e => (e.currentTarget.style.color = footerTextColor)}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 rounded-lg transition-colors"
                style={{ color: footerTextColor }}
                onMouseEnter={e => (e.currentTarget.style.color = isDark ? "#fff" : "#000")}
                onMouseLeave={e => (e.currentTarget.style.color = footerTextColor)}
              >
                <Languages className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" style={{ background: dropdownBg, border: `1px solid ${dropdownBorder}` }}>
              <DropdownMenuItem onClick={() => switchLang("en")} className={i18n.language === "en" ? "font-bold" : ""} style={{ color: dropdownTextColor }}>
                🇺🇸 {t("language.en")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => switchLang("ar")} className={i18n.language === "ar" ? "font-bold" : ""} style={{ color: dropdownTextColor }}>
                🇩🇿 {t("language.ar")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => switchLang("fr")} className={i18n.language === "fr" ? "font-bold" : ""} style={{ color: dropdownTextColor }}>
                🇫🇷 {t("language.fr")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 text-xs font-bold"
            style={{ background: avatarBg, color: avatarColor }}
          >
            {user?.email?.[0]?.toUpperCase() ?? "D"}
          </div>
          <span
            className="text-xs truncate flex-1"
            style={{ color: footerTextColor }}
            title={user?.email}
          >
            {user?.email}
          </span>
          <button
            onClick={handleLogout}
            title={t("auth.signOut")}
            className="p-1.5 rounded-lg transition-colors shrink-0"
            style={{ color: isDark ? "rgba(255,255,255,0.25)" : "rgba(30,30,30,0.3)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
            onMouseLeave={e => (e.currentTarget.style.color = isDark ? "rgba(255,255,255,0.25)" : "rgba(30,30,30,0.3)")}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`${isDark ? "portal-dark" : ""} flex h-screen`}
      style={{ background: mainBg, fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar desktop ── */}
      <aside
        className="hidden md:flex w-60 flex-col shrink-0"
        style={{
          background: sidebarBg,
          borderRight: `1px solid ${sidebarBorder}`,
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Sidebar mobile drawer ── */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 flex flex-col z-50 md:hidden transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: sidebarBg,
          borderRight: `1px solid ${sidebarBorder}`,
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 h-14 shrink-0"
          style={{ background: topBarBg, borderBottom: `1px solid ${sidebarBorder}` }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg"
            style={{ color: menuBtnColor }}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ background: "linear-gradient(135deg,#00FFE0,#00b3a0)" }}
          >
            <Zap className="h-3.5 w-3.5" style={{ color: "#050508" }} />
          </div>
          <span className="font-black text-sm" style={{ fontFamily: "'Space Mono', monospace", color: logoTextColor }}>
            AI Gateway
          </span>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ background: devBadgeBg, color: devBadgeColor, fontFamily: "'Space Mono', monospace" }}
          >
            DEV
          </span>
        </div>

        <main
          className="flex-1 overflow-y-auto p-4 md:p-8"
          style={{ background: mainBg }}
        >
          {children}
        </main>
      </div>

      <AnnouncementBanner />
    </div>
  );
}

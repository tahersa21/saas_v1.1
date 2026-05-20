import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ar from "./ar.json";
import fr from "./fr.json";

const SUPPORTED = ["ar", "en", "fr"] as const;
type SupportedLang = (typeof SUPPORTED)[number];

function detectLang(): SupportedLang {
  const saved = localStorage.getItem("lang");
  if (saved && SUPPORTED.includes(saved as SupportedLang)) {
    return saved as SupportedLang;
  }

  const browserLangs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const lang of browserLangs) {
    const code = lang.split("-")[0].toLowerCase();
    if (SUPPORTED.includes(code as SupportedLang)) {
      return code as SupportedLang;
    }
  }

  return "ar";
}

const lang = detectLang();

document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
document.documentElement.lang = lang;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    fr: { translation: fr },
  },
  lng: lang,
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

export default i18n;

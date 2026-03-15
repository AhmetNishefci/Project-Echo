import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";
import tr from "./locales/tr.json";
import sq from "./locales/sq.json";

/**
 * i18n configuration for Wave.
 *
 * - Auto-detects device language via expo-localization
 * - Falls back to English if the detected language isn't available
 * - New languages: add a JSON file in ./locales/ and register it in resources below
 * - Manual override: call i18n.changeLanguage("fr") from settings
 */
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    es: { translation: es },
    it: { translation: it },
    pt: { translation: pt },
    tr: { translation: tr },
    sq: { translation: sq },
  },
  lng: Localization.getLocales()?.[0]?.languageCode ?? "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React Native handles escaping
  },
});

export default i18n;

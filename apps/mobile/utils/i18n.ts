
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// If you see an error here, ensure 'resolveJsonModule' is enabled and 'module' is set to 'esnext' or 'nodenext' in tsconfig.json
import en from '../locales/en.json';
import he from '../locales/he.json';
import { I18nManager } from 'react-native';

const resources = {
  en: { translation: en },
  he: { translation: he },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

// Handle RTL for Hebrew
i18n.on('languageChanged', (lng) => {
  if (lng === 'he') {
    I18nManager.forceRTL(true);
  } else {
    I18nManager.forceRTL(false);
  }
});

export default i18n;

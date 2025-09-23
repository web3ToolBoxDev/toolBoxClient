import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import {en,zh_cn} from './utils';

const resources = {
  en: {
    translation: en,
  },
  'zh-CN': {
    translation: zh_cn,
  },
};

i18n
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    resources,
    lng: 'zh-CN', // Default language
    fallbackLng: 'en', // Fallback language if the current language translation is not available
    interpolation: {
      escapeValue: false, // React already does escaping
    },
  });

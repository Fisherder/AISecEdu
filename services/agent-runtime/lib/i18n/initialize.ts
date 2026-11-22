import type { i18n } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { supportedLocales } from './locales';
import { defaultLocale } from './types';

export function initializeI18n(instance: i18n) {
  return instance
    .use(resourcesToBackend((language: string) => import(`./locales/${language}.json`)))
    .init({
      lng: defaultLocale,
      fallbackLng: defaultLocale,
      supportedLngs: supportedLocales.map((locale) => locale.code),
      interpolation: { escapeValue: false },
    });
}

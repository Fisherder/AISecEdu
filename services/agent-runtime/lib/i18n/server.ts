import { createInstance } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { supportedLocales } from './locales';
import { defaultLocale } from './types';

const serverI18n = createInstance();
const initialized = serverI18n
  .use(resourcesToBackend((language: string) => import(`./locales/${language}.json`)))
  .init({
    lng: defaultLocale,
    fallbackLng: defaultLocale,
    supportedLngs: supportedLocales.map((locale) => locale.code),
    interpolation: {
      escapeValue: false,
    },
  });

const supportedLocaleCodes = new Set<string>(supportedLocales.map((locale) => locale.code));
const loadedLocales = new Map<string, Promise<void>>();

/**
 * Load and translate a UI message on the server without pulling react-i18next
 * into Next.js server route bundles.
 */
export async function translateServer(locale: string, key: string): Promise<string> {
  await initialized;
  const resolvedLocale = supportedLocaleCodes.has(locale) ? locale : defaultLocale;
  // i18next.loadLanguages returns early if the same locale is already in flight,
  // so concurrent callers (e.g. Promise.all) must await one shared promise.
  let pending = loadedLocales.get(resolvedLocale);
  if (!pending) {
    pending = serverI18n.loadLanguages(resolvedLocale).catch((error) => {
      loadedLocales.delete(resolvedLocale);
      throw error;
    });
    loadedLocales.set(resolvedLocale, pending);
  }
  await pending;
  return serverI18n.t(key, { lng: resolvedLocale });
}

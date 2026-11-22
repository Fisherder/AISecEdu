import { createInstance } from 'i18next';
import { initializeI18n } from './initialize';
import type { Locale } from './types';

const i18n = createInstance();
const ready = initializeI18n(i18n);

export async function getServerTranslator(locale: Locale) {
  await ready;
  await i18n.loadLanguages(locale);
  return i18n.getFixedT(locale);
}

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { initializeI18n } from './initialize';

void initializeI18n(i18n.use(initReactI18next));

export default i18n;

/**
 * i18next foundation for Operavia.
 *
 * Namespaced locale files live under `src/locales/{lang}/`.
 * Dual-catalog period: legacy flat `lib/i18n/{en,es,pt}.json` (via `lib/i18n.ts`
 * + `useI18n`) still owns unmigrated UI. Do not delete those keys.
 *
 * Migrated onto i18next so far (namespace key, not dotted legacy path):
 *   settings — languages, languageEn/Es/Pt, saveFailed
 *   common   — save, cancel, loading (selected dialogs + settings)
 *   pos      — checkout (PrepaidCheckoutModal, TableCheckoutModal)
 *   orders   — completed (OrdersFilterBar)
 *   products — title (products page header/loading)
 *
 * Keep using `useTranslation(ns)` alongside `useI18n()`; swap only keys that
 * already exist in both catalogs. English fallback: i18next `fallbackLng: 'en'`
 * plus the legacy catalog still present for everything else.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '@/lib/i18n';

import enCommon from '@/locales/en/common.json';
import enPos from '@/locales/en/pos.json';
import enOrders from '@/locales/en/orders.json';
import enProducts from '@/locales/en/products.json';
import enSettings from '@/locales/en/settings.json';
import esCommon from '@/locales/es/common.json';
import esPos from '@/locales/es/pos.json';
import esOrders from '@/locales/es/orders.json';
import esProducts from '@/locales/es/products.json';
import esSettings from '@/locales/es/settings.json';
import ptCommon from '@/locales/pt/common.json';
import ptPos from '@/locales/pt/pos.json';
import ptOrders from '@/locales/pt/orders.json';
import ptProducts from '@/locales/pt/products.json';
import ptSettings from '@/locales/pt/settings.json';

let initialized = false;

export function getI18nInstance() {
  if (!initialized) {
    void i18n.use(initReactI18next).init({
      resources: {
        en: {
          common: enCommon,
          pos: enPos,
          orders: enOrders,
          products: enProducts,
          settings: enSettings,
        },
        es: {
          common: esCommon,
          pos: esPos,
          orders: esOrders,
          products: esProducts,
          settings: esSettings,
        },
        pt: {
          common: ptCommon,
          pos: ptPos,
          orders: ptOrders,
          products: ptProducts,
          settings: ptSettings,
        },
      },
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: ['common', 'pos', 'orders', 'products', 'settings'],
      interpolation: { escapeValue: false },
      // Static export / Electron — no HTTP backend.
      react: { useSuspense: false },
    });
    initialized = true;
  }
  return i18n;
}

export function syncI18nLanguage(lang: Language): void {
  const instance = getI18nInstance();
  if (instance.language !== lang) {
    void instance.changeLanguage(lang);
  }
}

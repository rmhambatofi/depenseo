// Contenu commun aux exports CSV et Excel (F-EXP-01, ADR-036) : une ligne par dépense active,
// colonnes et libellés dans la langue du compte (fr par défaut, en sinon).
import type { ExpenseSource } from '../db/schema/index.js';

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportRow {
  /** Date calendaire AAAA-MM-JJ, recopiée telle quelle (NF-FMT-02). */
  date: string;
  /** Centimes (unité mineure de `currency`). */
  amount: number;
  currency: string;
  /** Catégorie racine ; la sous-catégorie éventuelle est dans `subcategory`. */
  category: string;
  subcategory: string | null;
  merchant: string | null;
  note: string | null;
  tags: string[];
  source: ExpenseSource;
}

export type ExportLanguage = 'fr' | 'en';

/** Même règle que les notifications : « en » explicite, français sinon. */
export function exportLanguage(language: string): ExportLanguage {
  return language === 'en' ? 'en' : 'fr';
}

interface Labels {
  headers: readonly string[];
  source: Record<ExpenseSource, string>;
  sheet: string;
}

export const EXPORT_LABELS: Record<ExportLanguage, Labels> = {
  fr: {
    headers: [
      'Date',
      'Montant',
      'Devise',
      'Catégorie',
      'Sous-catégorie',
      'Marchand',
      'Note',
      'Étiquettes',
      'Origine',
    ],
    source: { manual: 'Saisie', recurrence: 'Récurrence' },
    sheet: 'Dépenses',
  },
  en: {
    headers: [
      'Date',
      'Amount',
      'Currency',
      'Category',
      'Subcategory',
      'Merchant',
      'Note',
      'Tags',
      'Source',
    ],
    source: { manual: 'Manual', recurrence: 'Recurring' },
    sheet: 'Expenses',
  },
};

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

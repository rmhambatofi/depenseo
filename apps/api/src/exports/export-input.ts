// Corps de `POST …/exports` (F-EXP-01, ADR-036) : période en dates calendaires, bornes incluses.
import { isCalendarDate } from '@depenseo/shared';
import { z } from 'zod';
import { uuidV7 } from '../http/uuid-schemas.js';
import { EXPORT_FORMATS } from './export-format.js';

const date = z.string().refine(isCalendarDate, 'Date AAAA-MM-JJ attendue');

export const exportRequestSchema = z
  .strictObject({
    id: uuidV7,
    format: z.enum(EXPORT_FORMATS),
    from: date,
    to: date,
  })
  // Chaînes AAAA-MM-JJ valides : l'ordre lexicographique est l'ordre calendaire.
  .refine((body) => body.from <= body.to, { message: 'Période inversée', path: ['to'] });

export type ExportRequest = z.infer<typeof exportRequestSchema>;

// Contrat OpenAPI des dépenses récurrentes et des échéances (F-REC-01/03, ADR-032).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AMOUNT_KINDS,
  type AmountKind,
  OCCURRENCE_STATUSES,
  type OccurrenceStatus,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_MODES,
  type RecurrenceFrequency,
  type RecurrenceMode,
} from '../db/schema/index.js';
import { MAX_EXPENSE_AMOUNT } from '../expenses/expense-input.js';
import type { OccurrenceView } from './occurrences.service.js';
import { NAME_MAX_LENGTH } from './recurring-input.js';
import type { RecurringView } from './recurring.service.js';

const AMOUNT = { type: 'integer', minimum: 1, maximum: MAX_EXPENSE_AMOUNT } as const;

export class RecurringDto implements RecurringView {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  readonly name!: string;

  @ApiProperty({ ...AMOUNT, description: 'Unités mineures de `currency`' })
  readonly amount!: number;

  @ApiProperty({ example: 'EUR' })
  readonly currency!: string;

  @ApiProperty({ enum: AMOUNT_KINDS })
  readonly amountKind!: AmountKind;

  @ApiProperty({ enum: RECURRENCE_FREQUENCIES })
  readonly frequency!: RecurrenceFrequency;

  @ApiProperty({ format: 'date', description: 'Première échéance ; porte le jour (ADR-032)' })
  readonly startDate!: string;

  @ApiProperty({ format: 'uuid' })
  readonly categoryId!: string;

  @ApiProperty({ enum: RECURRENCE_MODES, description: 'auto : enregistrée à l’échéance' })
  readonly mode!: RecurrenceMode;

  @ApiProperty({ description: 'Rappel 3 jours avant l’échéance (F-REC-04)' })
  readonly remindThreeDaysBefore!: boolean;

  @ApiProperty({
    description:
      'Rappel le jour de l’échéance (F-REC-04) ; sans effet en mode auto (payée à minuit)',
  })
  readonly remindOnDueDate!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt!: Date;
}

export class CreateRecurringDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v7 généré par le client (idempotence)' })
  readonly id!: string;

  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  readonly name!: string;

  @ApiProperty(AMOUNT)
  readonly amount!: number;

  @ApiPropertyOptional({ example: 'EUR', description: 'Défaut : devise du compte' })
  readonly currency?: string;

  @ApiPropertyOptional({ enum: AMOUNT_KINDS, default: 'fixed' })
  readonly amountKind?: AmountKind;

  @ApiProperty({ enum: RECURRENCE_FREQUENCIES })
  readonly frequency!: RecurrenceFrequency;

  @ApiProperty({ format: 'date' })
  readonly startDate!: string;

  @ApiProperty({ format: 'uuid' })
  readonly categoryId!: string;

  @ApiPropertyOptional({ enum: RECURRENCE_MODES, default: 'confirm' })
  readonly mode?: RecurrenceMode;

  @ApiPropertyOptional({ default: true, description: 'Rappel 3 jours avant l’échéance' })
  readonly remindThreeDaysBefore?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Rappel le jour de l’échéance' })
  readonly remindOnDueDate?: boolean;
}

export class UpdateRecurringDto {
  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  readonly name?: string;

  @ApiPropertyOptional(AMOUNT)
  readonly amount?: number;

  @ApiPropertyOptional({ enum: AMOUNT_KINDS })
  readonly amountKind?: AmountKind;

  @ApiPropertyOptional({ format: 'uuid' })
  readonly categoryId?: string;

  @ApiPropertyOptional({ enum: RECURRENCE_MODES })
  readonly mode?: RecurrenceMode;

  @ApiPropertyOptional({ description: 'Rappel 3 jours avant l’échéance' })
  readonly remindThreeDaysBefore?: boolean;

  @ApiPropertyOptional({ description: 'Rappel le jour de l’échéance' })
  readonly remindOnDueDate?: boolean;
}

export class OccurrenceDto implements OccurrenceView {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly recurringExpenseId!: string;

  @ApiProperty()
  readonly name!: string;

  @ApiProperty({ format: 'date' })
  readonly dueDate!: string;

  @ApiProperty({ enum: OCCURRENCE_STATUSES })
  readonly status!: OccurrenceStatus;

  @ApiProperty({ ...AMOUNT, description: 'Attendu (ajusté ou de la récurrence) ; payée : réel' })
  readonly amount!: number;

  @ApiProperty({ description: 'Montant propre à cette échéance' })
  readonly adjusted!: boolean;

  @ApiProperty({ example: 'EUR' })
  readonly currency!: string;

  @ApiProperty({ enum: AMOUNT_KINDS })
  readonly amountKind!: AmountKind;

  @ApiProperty({ format: 'uuid' })
  readonly categoryId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  readonly expenseId!: string | null;

  @ApiProperty({ description: 'Mode confirmation : échéance due, à confirmer (F-REC-02)' })
  readonly awaitingConfirmation!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt!: Date;
}

export class AdjustOccurrenceDto {
  @ApiProperty({ ...AMOUNT, nullable: true, description: 'NULL = montant de la récurrence' })
  readonly amount!: number | null;
}

export class PayOccurrenceDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v7 de la dépense créée (idempotence)' })
  readonly expenseId!: string;

  @ApiPropertyOptional({ ...AMOUNT, description: 'Montant réel ; défaut : montant attendu' })
  readonly amount?: number;

  @ApiPropertyOptional({ format: 'date', description: 'Défaut : date d’échéance' })
  readonly date?: string;
}

// Toutes les erreurs HTTP au format RFC 9457 / 7807 (`application/problem+json`).
// `detail` n'est exposé que pour une ProblemException ; les erreurs inattendues donnent
// un 500 générique et sont journalisées (sans leur message, voir logging/redact.ts).
import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { pathOnly } from '../logging/pino-options.js';
import { ProblemException } from './problem.exception.js';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export const PROBLEM_JSON = 'application/problem+json';

/** Erreur d'un middleware Express (ex. body-parser) marquée comme exposable, statut 4xx. */
function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status, expose } = exception as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true
    ? status
    : undefined;
}

function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  return clientErrorStatus(exception) ?? HttpStatus.INTERNAL_SERVER_ERROR;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const status = statusOf(exception);

    if (status >= 500) this.logger.error({ err: exception }, 'unhandled error');
    if (res.headersSent) return;

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      ...(exception instanceof ProblemException ? { detail: exception.detail } : {}),
      instance: pathOnly(req.originalUrl),
    };
    res.status(status).type(PROBLEM_JSON).send(JSON.stringify(problem));
  }
}

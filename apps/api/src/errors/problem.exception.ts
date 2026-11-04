import { HttpException } from '@nestjs/common';

/**
 * Seule exception dont le `detail` est renvoyé au client (ADR-013). Les autres HttpException
 * (dont celles de Nest et de body-parser, qui recopient parfois l'entrée reçue) n'exposent
 * que le statut. Ne jamais interpoler de donnée personnelle ni de montant dans `detail`.
 */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    readonly detail: string,
  ) {
    super(detail, status);
  }
}

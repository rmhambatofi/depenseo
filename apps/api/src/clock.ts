// Horloge injectable : tout horodatage applicatif (created_at, run_at, échéances) passe par elle,
// pour que les tests maîtrisent le temps sans attendre (ADR-015).
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

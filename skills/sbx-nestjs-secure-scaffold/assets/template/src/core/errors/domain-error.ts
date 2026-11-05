/**
 * Base class for expected business failures.
 * Instances are RETURNED inside Left(...), never thrown.
 */
export abstract class DomainError {
  abstract readonly code: string;

  constructor(readonly message: string) {}
}

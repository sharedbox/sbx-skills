import { DomainError } from '@/core/errors/domain-error';

export class InvalidAccessTokenError extends DomainError {
  readonly code = 'INVALID_ACCESS_TOKEN';

  constructor() {
    super('Access token is missing, invalid or expired.');
  }
}

import { DomainError } from '@/core/errors/domain-error';

export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';

  constructor() {
    super('Refresh token is invalid or expired.');
  }
}

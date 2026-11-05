import { DomainError } from '@/core/errors/domain-error';

export class RefreshTokenReuseDetectedError extends DomainError {
  readonly code = 'REFRESH_TOKEN_REUSE_DETECTED';

  constructor() {
    super('Refresh token was already used; the session has been revoked.');
  }
}

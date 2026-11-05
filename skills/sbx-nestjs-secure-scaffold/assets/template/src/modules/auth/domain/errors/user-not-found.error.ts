import { DomainError } from '@/core/errors/domain-error';

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';

  constructor(id: string) {
    super(`User "${id}" was not found.`);
  }
}

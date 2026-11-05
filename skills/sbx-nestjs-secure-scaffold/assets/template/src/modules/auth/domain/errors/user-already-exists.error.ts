import { DomainError } from '@/core/errors/domain-error';

export class UserAlreadyExistsError extends DomainError {
  readonly code = 'USER_ALREADY_EXISTS';

  constructor(email: string) {
    super(`A user with e-mail "${email}" already exists.`);
  }
}

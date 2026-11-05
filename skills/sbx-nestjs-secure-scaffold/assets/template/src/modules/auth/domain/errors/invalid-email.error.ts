import { DomainError } from '@/core/errors/domain-error';

export class InvalidEmailError extends DomainError {
  readonly code = 'INVALID_EMAIL';

  constructor(email: string) {
    super(`"${email}" is not a valid e-mail address.`);
  }
}

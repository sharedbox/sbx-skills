import { Either, left, right } from '@/core/either';
import { InvalidEmailError } from '../errors/invalid-email.error';

export class Email {
  private constructor(private readonly value: string) {}

  static create(raw: string): Either<InvalidEmailError, Email> {
    const normalized = raw.trim().toLowerCase();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!isValid) {
      return left(new InvalidEmailError(raw));
    }
    return right(new Email(normalized));
  }

  /** Rebuilds an already-validated value (used by mappers when loading from storage). */
  static restore(value: string): Email {
    return new Email(value);
  }

  toString(): string {
    return this.value;
  }
}

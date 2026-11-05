import { Either, left, right } from '@/core/either';
import { User } from '../../domain/entities/user';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { UserAlreadyExistsError } from '../../domain/errors/user-already-exists.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { PasswordHasher } from '../ports/password-hasher';

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export type RegisterUserOutput = Either<InvalidEmailError | UserAlreadyExistsError, { user: User }>;

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    /** Scopes granted on sign-up. Privileged scopes are never self-assigned. */
    private readonly defaultScopes: readonly string[],
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const emailOrError = Email.create(input.email);
    if (emailOrError.isLeft()) return left(emailOrError.value);
    const email = emailOrError.value;

    if (await this.users.findByEmail(email.toString())) {
      return left(new UserAlreadyExistsError(email.toString()));
    }

    const user = User.create({
      name: input.name.trim(),
      email,
      passwordHash: await this.hasher.hash(input.password),
      scopes: [...this.defaultScopes],
    });
    await this.users.create(user);

    return right({ user });
  }
}

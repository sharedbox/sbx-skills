import { Either, left, right } from '@/core/either';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { PasswordHasher } from '../ports/password-hasher';
import { AuthTokens, SessionIssuer } from '../services/session-issuer';

export interface AuthenticateUserInput {
  email: string;
  password: string;
}

export type AuthenticateUserOutput = Either<InvalidCredentialsError, AuthTokens>;

export class AuthenticateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: AuthenticateUserInput): Promise<AuthenticateUserOutput> {
    const email = Email.create(input.email);
    const user = email.isRight() ? await this.users.findByEmail(email.value.toString()) : null;

    if (!user) {
      await this.hasher.verifyAgainstDummy(input.password);
      return left(new InvalidCredentialsError());
    }

    const passwordMatches = await this.hasher.verify(input.password, user.passwordHash);
    // same error for wrong password and inactive account: no account-state disclosure
    if (!passwordMatches || !user.canAuthenticate()) {
      return left(new InvalidCredentialsError());
    }

    const { tokens } = await this.sessions.issue(user);
    return right(tokens);
  }
}

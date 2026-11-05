import { FakeAccessTokenIssuer, FakeOpaqueTokenService, FakePasswordHasher } from '../../../../../test/auth/fakes';
import { InMemoryRefreshTokenRepository } from '../../../../../test/auth/in-memory-refresh-token.repository';
import { InMemoryUserRepository } from '../../../../../test/auth/in-memory-user.repository';
import { makeUser } from '../../../../../test/auth/make-user';
import { FakeClock } from '../../../../../test/shared/fake-clock';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { SessionIssuer } from '../services/session-issuer';
import { AuthenticateUserUseCase } from './authenticate-user.use-case';

describe('AuthenticateUserUseCase', () => {
  let users: InMemoryUserRepository;
  let refreshTokens: InMemoryRefreshTokenRepository;
  let hasher: FakePasswordHasher;
  let sut: AuthenticateUserUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    refreshTokens = new InMemoryRefreshTokenRepository();
    hasher = new FakePasswordHasher();
    const sessions = new SessionIssuer(
      refreshTokens,
      new FakeAccessTokenIssuer(),
      new FakeOpaqueTokenService(),
      new FakeClock(),
      7,
    );
    sut = new AuthenticateUserUseCase(users, hasher, sessions);
  });

  it('issues an access token with the user scopes and a stored, hashed refresh token', async () => {
    const user = makeUser();
    users.items.push(user);

    const result = await sut.execute({ email: 'JANE@example.com', password: 'correct horse battery' });

    expect(result.isRight()).toBe(true);
    if (result.isLeft()) return;
    expect(result.value.accessToken).toBe(`access:${user.id.toString()}:profile:read`);
    expect(result.value.refreshToken).toBe(`${refreshTokens.items[0].id.toString()}.secret1`);
    expect(refreshTokens.items[0].tokenHash).toBe('h(secret1)'); // never the plain secret
    expect(refreshTokens.items[0].expiresAt.toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('returns InvalidCredentialsError for a wrong password without issuing tokens', async () => {
    users.items.push(makeUser());

    const result = await sut.execute({ email: 'jane@example.com', password: 'wrong' });

    expect(result.value).toBeInstanceOf(InvalidCredentialsError);
    expect(refreshTokens.items).toHaveLength(0);
  });

  it('returns the same error for an unknown user and still spends hashing time', async () => {
    const result = await sut.execute({ email: 'ghost@example.com', password: 'whatever' });

    expect(result.value).toBeInstanceOf(InvalidCredentialsError);
    expect(hasher.dummyCalls).toBe(1);
  });

  it('rejects inactive users with the same generic error', async () => {
    users.items.push(makeUser({ isActive: false }));

    const result = await sut.execute({ email: 'jane@example.com', password: 'correct horse battery' });

    expect(result.value).toBeInstanceOf(InvalidCredentialsError);
    expect(refreshTokens.items).toHaveLength(0);
  });
});

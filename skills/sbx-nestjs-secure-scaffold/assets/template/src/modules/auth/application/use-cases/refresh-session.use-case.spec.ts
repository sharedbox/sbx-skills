import { FakeAccessTokenIssuer, FakeOpaqueTokenService } from '../../../../../test/auth/fakes';
import { InMemoryRefreshTokenRepository } from '../../../../../test/auth/in-memory-refresh-token.repository';
import { InMemoryUserRepository } from '../../../../../test/auth/in-memory-user.repository';
import { makeUser } from '../../../../../test/auth/make-user';
import { FakeClock } from '../../../../../test/shared/fake-clock';
import { User } from '../../domain/entities/user';
import { InvalidRefreshTokenError } from '../../domain/errors/invalid-refresh-token.error';
import { RefreshTokenReuseDetectedError } from '../../domain/errors/refresh-token-reuse-detected.error';
import { SessionIssuer } from '../services/session-issuer';
import { RefreshSessionUseCase } from './refresh-session.use-case';

const DAY = 24 * 60 * 60 * 1000;

describe('RefreshSessionUseCase', () => {
  let users: InMemoryUserRepository;
  let refreshTokens: InMemoryRefreshTokenRepository;
  let clock: FakeClock;
  let sessions: SessionIssuer;
  let sut: RefreshSessionUseCase;
  let user: User;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    refreshTokens = new InMemoryRefreshTokenRepository();
    clock = new FakeClock();
    const opaque = new FakeOpaqueTokenService();
    sessions = new SessionIssuer(refreshTokens, new FakeAccessTokenIssuer(), opaque, clock, 7);
    sut = new RefreshSessionUseCase(refreshTokens, users, opaque, sessions, clock);
    user = makeUser();
    users.items.push(user);
  });

  it('rotates: returns a new pair and revokes the used token', async () => {
    const { tokens } = await sessions.issue(user);

    const result = await sut.execute({ refreshToken: tokens.refreshToken });

    expect(result.isRight()).toBe(true);
    if (result.isLeft()) return;
    expect(result.value.refreshToken).not.toBe(tokens.refreshToken);
    const [old, current] = refreshTokens.items;
    expect(old.isRevoked()).toBe(true);
    expect(old.replacedById).toBe(current.id.toString());
    expect(current.familyId).toBe(old.familyId);
    expect(current.isRevoked()).toBe(false);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const { tokens } = await sessions.issue(user);
    await sut.execute({ refreshToken: tokens.refreshToken });

    const replay = await sut.execute({ refreshToken: tokens.refreshToken });

    expect(replay.value).toBeInstanceOf(RefreshTokenReuseDetectedError);
    expect(refreshTokens.items.every((t) => t.isRevoked())).toBe(true);
  });

  it('rejects expired tokens', async () => {
    const { tokens } = await sessions.issue(user);
    clock.advance(8 * DAY);

    const result = await sut.execute({ refreshToken: tokens.refreshToken });

    expect(result.value).toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('rejects a token whose secret does not match', async () => {
    const { tokens } = await sessions.issue(user);
    const [id] = tokens.refreshToken.split('.');

    const result = await sut.execute({ refreshToken: `${id}.forged` });

    expect(result.value).toBeInstanceOf(InvalidRefreshTokenError);
    expect(refreshTokens.items[0].isRevoked()).toBe(false);
  });

  it('rejects malformed and unknown tokens', async () => {
    expect((await sut.execute({ refreshToken: 'garbage' })).value).toBeInstanceOf(InvalidRefreshTokenError);
    expect((await sut.execute({ refreshToken: 'unknown.secret' })).value).toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('revokes the family when the user was deactivated', async () => {
    const { tokens } = await sessions.issue(user);
    user.deactivate();

    const result = await sut.execute({ refreshToken: tokens.refreshToken });

    expect(result.value).toBeInstanceOf(InvalidRefreshTokenError);
    expect(refreshTokens.items[0].isRevoked()).toBe(true);
  });
});

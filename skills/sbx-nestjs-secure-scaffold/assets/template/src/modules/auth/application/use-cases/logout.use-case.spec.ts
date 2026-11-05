import { FakeAccessTokenIssuer, FakeOpaqueTokenService } from '../../../../../test/auth/fakes';
import { InMemoryRefreshTokenRepository } from '../../../../../test/auth/in-memory-refresh-token.repository';
import { makeUser } from '../../../../../test/auth/make-user';
import { FakeClock } from '../../../../../test/shared/fake-clock';
import { SessionIssuer } from '../services/session-issuer';
import { LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  it('revokes every token of the session family', async () => {
    const refreshTokens = new InMemoryRefreshTokenRepository();
    const opaque = new FakeOpaqueTokenService();
    const clock = new FakeClock();
    const sessions = new SessionIssuer(refreshTokens, new FakeAccessTokenIssuer(), opaque, clock, 7);
    const user = makeUser();
    const first = await sessions.issue(user);
    await sessions.issue(user, refreshTokens.items[0].familyId);

    const result = await new LogoutUseCase(refreshTokens, opaque, clock).execute({
      refreshToken: first.tokens.refreshToken,
    });

    expect(result.isRight()).toBe(true);
    expect(refreshTokens.items.every((t) => t.isRevoked())).toBe(true);
  });

  it('succeeds silently for unknown or malformed tokens', async () => {
    const sut = new LogoutUseCase(new InMemoryRefreshTokenRepository(), new FakeOpaqueTokenService(), new FakeClock());

    expect((await sut.execute({ refreshToken: 'garbage' })).isRight()).toBe(true);
    expect((await sut.execute({ refreshToken: 'id.secret' })).isRight()).toBe(true);
  });
});

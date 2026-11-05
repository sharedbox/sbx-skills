import { Either, left, right } from '@/core/either';
import { Clock } from '../../../../shared/application/ports/clock';
import { InvalidRefreshTokenError } from '../../domain/errors/invalid-refresh-token.error';
import { RefreshTokenReuseDetectedError } from '../../domain/errors/refresh-token-reuse-detected.error';
import { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { OpaqueTokenService } from '../ports/opaque-token-service';
import { parseRefreshToken } from '../services/refresh-token-format';
import { AuthTokens, SessionIssuer } from '../services/session-issuer';

export interface RefreshSessionInput {
  refreshToken: string;
}

export type RefreshSessionOutput = Either<
  InvalidRefreshTokenError | RefreshTokenReuseDetectedError,
  AuthTokens
>;

/** Rotation with reuse detection: every refresh token works exactly once. */
export class RefreshSessionUseCase {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  async execute({ refreshToken }: RefreshSessionInput): Promise<RefreshSessionOutput> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) return left(new InvalidRefreshTokenError());

    const stored = await this.refreshTokens.findById(parsed.id);
    if (!stored || !this.opaqueTokens.matches(parsed.secret, stored.tokenHash)) {
      return left(new InvalidRefreshTokenError());
    }

    const now = this.clock.now();
    if (stored.isRevoked()) {
      // a used token came back: it was stolen or replayed -> kill the whole session family
      await this.refreshTokens.revokeFamily(stored.familyId, now);
      return left(new RefreshTokenReuseDetectedError());
    }
    if (stored.isExpired(now)) {
      return left(new InvalidRefreshTokenError());
    }

    const user = await this.users.findById(stored.userId);
    if (!user || !user.canAuthenticate()) {
      await this.refreshTokens.revokeFamily(stored.familyId, now);
      return left(new InvalidRefreshTokenError());
    }

    const { tokens, refreshTokenId } = await this.sessions.issue(user, stored.familyId);
    stored.revoke(now, refreshTokenId);
    await this.refreshTokens.save(stored);

    return right(tokens);
  }
}

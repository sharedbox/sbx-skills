import { UniqueEntityId } from '@/core/entities/unique-entity-id';
import { Clock } from '../../../../shared/application/ports/clock';
import { RefreshToken } from '../../domain/entities/refresh-token';
import { User } from '../../domain/entities/user';
import { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { AccessTokenIssuer } from '../ports/access-token-issuer';
import { OpaqueTokenService } from '../ports/opaque-token-service';
import { formatRefreshToken } from './refresh-token-format';

export interface AuthTokens {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Collaborator shared by the login and refresh use cases (not a use case itself). */
export class SessionIssuer {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly clock: Clock,
    private readonly refreshTokenTtlDays: number,
  ) {}

  async issue(user: User, familyId?: string): Promise<{ tokens: AuthTokens; refreshTokenId: string }> {
    const now = this.clock.now();
    const secret = this.opaqueTokens.generateSecret();
    const id = new UniqueEntityId();
    const refreshToken = RefreshToken.create(
      {
        userId: user.id.toString(),
        familyId: familyId ?? new UniqueEntityId().toString(),
        tokenHash: this.opaqueTokens.hash(secret),
        expiresAt: new Date(now.getTime() + this.refreshTokenTtlDays * DAY_MS),
        createdAt: now,
      },
      id,
    );
    await this.refreshTokens.create(refreshToken);

    const access = await this.accessTokens.issue({ subject: user.id.toString(), scopes: user.scopes });

    return {
      refreshTokenId: id.toString(),
      tokens: {
        tokenType: 'Bearer',
        accessToken: access.token,
        expiresIn: access.expiresInSeconds,
        refreshToken: formatRefreshToken(id.toString(), secret),
        refreshTokenExpiresAt: refreshToken.expiresAt,
      },
    };
  }
}

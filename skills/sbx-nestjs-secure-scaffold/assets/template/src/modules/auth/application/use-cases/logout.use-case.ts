import { Either, right } from '@/core/either';
import { Clock } from '../../../../shared/application/ports/clock';
import { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { OpaqueTokenService } from '../ports/opaque-token-service';
import { parseRefreshToken } from '../services/refresh-token-format';

export interface LogoutInput {
  refreshToken: string;
}

/** Idempotent: always succeeds, so it reveals nothing about token validity. */
export class LogoutUseCase {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly clock: Clock,
  ) {}

  async execute({ refreshToken }: LogoutInput): Promise<Either<never, null>> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) return right(null);

    const stored = await this.refreshTokens.findById(parsed.id);
    if (stored && this.opaqueTokens.matches(parsed.secret, stored.tokenHash)) {
      await this.refreshTokens.revokeFamily(stored.familyId, this.clock.now());
    }
    return right(null);
  }
}

import { RefreshToken } from '../entities/refresh-token';

export abstract class RefreshTokenRepository {
  abstract findById(id: string): Promise<RefreshToken | null>;
  abstract create(token: RefreshToken): Promise<void>;
  abstract save(token: RefreshToken): Promise<void>;
  abstract revokeFamily(familyId: string, revokedAt: Date): Promise<void>;
}

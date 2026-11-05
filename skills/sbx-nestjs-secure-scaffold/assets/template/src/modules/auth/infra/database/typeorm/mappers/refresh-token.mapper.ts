import { UniqueEntityId } from '@/core/entities/unique-entity-id';
import { RefreshToken } from '../../../../domain/entities/refresh-token';
import { RefreshTokenOrmEntity } from '../entities/refresh-token.orm-entity';

export class RefreshTokenMapper {
  static toDomain(raw: RefreshTokenOrmEntity): RefreshToken {
    return RefreshToken.create(
      {
        userId: raw.userId,
        familyId: raw.familyId,
        tokenHash: raw.tokenHash,
        expiresAt: raw.expiresAt,
        revokedAt: raw.revokedAt,
        replacedById: raw.replacedById,
        createdAt: raw.createdAt,
      },
      new UniqueEntityId(raw.id),
    );
  }

  static toPersistence(token: RefreshToken): RefreshTokenOrmEntity {
    const orm = new RefreshTokenOrmEntity();
    orm.id = token.id.toString();
    orm.userId = token.userId;
    orm.familyId = token.familyId;
    orm.tokenHash = token.tokenHash;
    orm.expiresAt = token.expiresAt;
    orm.revokedAt = token.revokedAt;
    orm.replacedById = token.replacedById;
    orm.createdAt = token.createdAt;
    return orm;
  }
}

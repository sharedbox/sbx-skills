import { RefreshToken } from '@/modules/auth/domain/entities/refresh-token';
import { RefreshTokenRepository } from '@/modules/auth/domain/repositories/refresh-token.repository';

export class InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  items: RefreshToken[] = [];

  async findById(id: string): Promise<RefreshToken | null> {
    return this.items.find((t) => t.id.toString() === id) ?? null;
  }

  async create(token: RefreshToken): Promise<void> {
    this.items.push(token);
  }

  async save(token: RefreshToken): Promise<void> {
    const index = this.items.findIndex((t) => t.id.equals(token.id));
    if (index >= 0) this.items[index] = token;
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    this.items.filter((t) => t.familyId === familyId).forEach((t) => t.revoke(revokedAt));
  }
}

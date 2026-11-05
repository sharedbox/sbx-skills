import { Entity } from '@/core/entities/entity';
import { UniqueEntityId } from '@/core/entities/unique-entity-id';

export interface RefreshTokenProps {
  userId: string;
  /** All tokens descending from one login share a family; reuse revokes the whole family. */
  familyId: string;
  /** SHA-256 of the secret part. The plain secret is never stored. */
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
}

type CreateRefreshTokenProps = Omit<RefreshTokenProps, 'revokedAt' | 'replacedById'> &
  Partial<Pick<RefreshTokenProps, 'revokedAt' | 'replacedById'>>;

export class RefreshToken extends Entity<RefreshTokenProps> {
  static create(props: CreateRefreshTokenProps, id?: UniqueEntityId): RefreshToken {
    return new RefreshToken(
      { ...props, revokedAt: props.revokedAt ?? null, replacedById: props.replacedById ?? null },
      id,
    );
  }

  get userId(): string {
    return this.props.userId;
  }

  get familyId(): string {
    return this.props.familyId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  get replacedById(): string | null {
    return this.props.replacedById;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.props.expiresAt.getTime();
  }

  /** Marks the token as used/revoked. Idempotent: the first revocation wins. */
  revoke(now: Date, replacedById: string | null = null): void {
    if (this.props.revokedAt) return;
    this.props.revokedAt = now;
    this.props.replacedById = replacedById;
  }
}

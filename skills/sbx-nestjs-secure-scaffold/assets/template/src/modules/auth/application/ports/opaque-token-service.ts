/** High-entropy opaque secrets and their one-way hashes (refresh tokens). */
export abstract class OpaqueTokenService {
  abstract generateSecret(): string;
  abstract hash(secret: string): string;
  /** Constant-time comparison. */
  abstract matches(secret: string, hash: string): boolean;
}

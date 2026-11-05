import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { PasswordHasher } from '../../application/ports/password-hasher';

/** OWASP Password Storage Cheat Sheet: Argon2id, m=19 MiB, t=2, p=1. */
const OPTIONS = { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  async verify(plain: string, passwordHash: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plain);
    } catch {
      return false; // malformed hash: treat as mismatch
    }
  }

  async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= hash('dummy-password-for-timing-equalization', OPTIONS);
    await this.verify(plain, await this.dummyHash);
  }
}

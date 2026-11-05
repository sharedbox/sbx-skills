import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OpaqueTokenService } from '../../application/ports/opaque-token-service';

@Injectable()
export class CryptoOpaqueTokenService extends OpaqueTokenService {
  generateSecret(): string {
    return randomBytes(32).toString('base64url'); // 256 bits of entropy
  }

  hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  matches(secret: string, hash: string): boolean {
    const candidate = Buffer.from(this.hash(secret), 'hex');
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }
}

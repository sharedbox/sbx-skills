import { AccessTokenIssuer, IssuedAccessToken } from '@/modules/auth/application/ports/access-token-issuer';
import { OpaqueTokenService } from '@/modules/auth/application/ports/opaque-token-service';
import { PasswordHasher } from '@/modules/auth/application/ports/password-hasher';

export class FakePasswordHasher extends PasswordHasher {
  dummyCalls = 0;

  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }

  async verifyAgainstDummy(): Promise<void> {
    this.dummyCalls += 1;
  }
}

export class FakeAccessTokenIssuer extends AccessTokenIssuer {
  async issue(claims: { subject: string; scopes: readonly string[] }): Promise<IssuedAccessToken> {
    return { token: `access:${claims.subject}:${claims.scopes.join(' ')}`, expiresInSeconds: 900 };
  }
}

export class FakeOpaqueTokenService extends OpaqueTokenService {
  private counter = 0;

  generateSecret(): string {
    this.counter += 1;
    return `secret${this.counter}`;
  }

  hash(secret: string): string {
    return `h(${secret})`;
  }

  matches(secret: string, hash: string): boolean {
    return this.hash(secret) === hash;
  }
}

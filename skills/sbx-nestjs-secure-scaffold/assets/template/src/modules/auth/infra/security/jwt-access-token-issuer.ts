import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../../../config/env.schema';
import {
  ACCESS_TOKEN_ALGORITHM,
  AccessTokenPayload,
} from '../../../../shared/infra/security/access-token-payload';
import { AccessTokenIssuer, IssuedAccessToken } from '../../application/ports/access-token-issuer';

@Injectable()
export class JwtAccessTokenIssuer extends AccessTokenIssuer {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async issue(claims: { subject: string; scopes: readonly string[] }): Promise<IssuedAccessToken> {
    const config = this.config;
    const expiresInSeconds = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const payload: Pick<AccessTokenPayload, 'scope'> = { scope: claims.scopes.join(' ') };
    const token = await this.jwt.signAsync(payload, {
      secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithm: ACCESS_TOKEN_ALGORITHM,
      subject: claims.subject,
      issuer: config.get('JWT_ISSUER', { infer: true }),
      audience: config.get('JWT_AUDIENCE', { infer: true }),
      expiresIn: expiresInSeconds,
      jwtid: randomUUID(),
    });
    return { token, expiresInSeconds };
  }
}

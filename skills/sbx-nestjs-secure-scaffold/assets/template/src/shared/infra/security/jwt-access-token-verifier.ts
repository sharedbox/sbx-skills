import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Either, left, right } from '@/core/either';
import type { Env } from '../../../config/env.schema';
import { InvalidAccessTokenError } from '../../application/errors/invalid-access-token.error';
import { AccessTokenVerifier } from '../../application/ports/access-token-verifier';
import { Principal } from '../../application/principal';
import { ACCESS_TOKEN_ALGORITHM, AccessTokenPayload } from './access-token-payload';

@Injectable()
export class JwtAccessTokenVerifier extends AccessTokenVerifier {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async verify(token: string): Promise<Either<InvalidAccessTokenError, Principal>> {
    const config = this.config;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        issuer: config.get('JWT_ISSUER', { infer: true }),
        audience: config.get('JWT_AUDIENCE', { infer: true }),
        algorithms: [ACCESS_TOKEN_ALGORITHM], // pinned: rejects "none" and algorithm confusion
      });
      if (typeof payload.sub !== 'string' || typeof payload.scope !== 'string') {
        return left(new InvalidAccessTokenError());
      }
      return right({
        subject: payload.sub,
        scopes: payload.scope.split(' ').filter(Boolean),
        tokenId: payload.jti,
      });
    } catch {
      return left(new InvalidAccessTokenError());
    }
  }
}

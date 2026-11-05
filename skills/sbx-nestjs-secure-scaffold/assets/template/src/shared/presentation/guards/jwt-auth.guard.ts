import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { AccessTokenVerifier } from '../../application/ports/access-token-verifier';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest } from '../http/authenticated-request';

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

/** Global guard: authentication is the default, @Public() is the exception. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const match = BEARER.exec(request.headers.authorization ?? '');
    if (!match) return this.reject(http.getResponse<Response>());

    const result = await this.verifier.verify(match[1]);
    if (result.isLeft()) return this.reject(http.getResponse<Response>());

    request.principal = result.value;
    return true;
  }

  private reject(response: Response): never {
    response.setHeader('WWW-Authenticate', 'Bearer');
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required.' });
  }
}

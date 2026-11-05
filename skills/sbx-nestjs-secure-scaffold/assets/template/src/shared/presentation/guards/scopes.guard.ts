import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { AuthenticatedRequest } from '../http/authenticated-request';

/** Runs after JwtAuthGuard. Denies when the token lacks any required scope. */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_SCOPES_KEY, targets);
    if (!required || required.length === 0) return true;

    const granted = new Set(context.switchToHttp().getRequest<AuthenticatedRequest>().principal?.scopes ?? []);
    const missing = required.filter((scope) => !granted.has(scope));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_SCOPE',
        message: 'The access token does not grant the required scope.',
        requiredScopes: required,
      });
    }
    return true;
  }
}

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { ScopesGuard } from './scopes.guard';

function contextWith(meta: Record<string, unknown>, scopes?: string[]): ExecutionContext {
  const handler = () => undefined;
  Reflect.defineMetadata(REQUIRED_SCOPES_KEY, meta[REQUIRED_SCOPES_KEY], handler);
  Reflect.defineMetadata(IS_PUBLIC_KEY, meta[IS_PUBLIC_KEY], handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ principal: scopes ? { subject: 'u1', scopes } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('ScopesGuard', () => {
  const guard = new ScopesGuard(new Reflector());

  it('allows when the token has every required scope', () => {
    const ctx = contextWith({ [REQUIRED_SCOPES_KEY]: ['a:read', 'a:write'] }, ['a:read', 'a:write', 'x']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when any required scope is missing', () => {
    const ctx = contextWith({ [REQUIRED_SCOPES_KEY]: ['a:read', 'a:write'] }, ['a:read']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies when there is no principal at all', () => {
    const ctx = contextWith({ [REQUIRED_SCOPES_KEY]: ['a:read'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('skips public routes and routes without scope requirements', () => {
    expect(guard.canActivate(contextWith({ [IS_PUBLIC_KEY]: true, [REQUIRED_SCOPES_KEY]: ['a'] }))).toBe(true);
    expect(guard.canActivate(contextWith({}, ['x']))).toBe(true);
  });
});

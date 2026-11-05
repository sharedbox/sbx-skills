import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Principal } from '../../application/principal';
import { AuthenticatedRequest } from '../http/authenticated-request';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const principal = ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new UnauthorizedException();
    return principal;
  },
);

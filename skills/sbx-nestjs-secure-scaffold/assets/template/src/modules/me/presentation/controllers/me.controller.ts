import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../../../../shared/application/principal';
import { CurrentPrincipal } from '../../../../shared/presentation/decorators/current-principal.decorator';
import { RequireScopes } from '../../../../shared/presentation/decorators/require-scopes.decorator';

/** Example protected route: tokens are issued by an external identity provider. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  @Get()
  @RequireScopes('profile:read')
  me(@CurrentPrincipal() principal: Principal): { subject: string; scopes: readonly string[] } {
    return { subject: principal.subject, scopes: principal.scopes };
  }
}

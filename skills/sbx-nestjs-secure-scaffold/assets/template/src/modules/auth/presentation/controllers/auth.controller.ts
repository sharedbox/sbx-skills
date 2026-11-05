import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Principal } from '../../../../shared/application/principal';
import { CurrentPrincipal } from '../../../../shared/presentation/decorators/current-principal.decorator';
import { Public } from '../../../../shared/presentation/decorators/public.decorator';
import { RequireScopes } from '../../../../shared/presentation/decorators/require-scopes.decorator';
import { AuthenticateUserUseCase } from '../../application/use-cases/authenticate-user.use-case';
import { GetProfileUseCase } from '../../application/use-cases/get-profile.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import { LoginDto } from '../dtos/login.dto';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { RegisterDto } from '../dtos/register.dto';
import { toHttpException } from '../errors/auth-error.mapper';
import { AuthTokensHttpResponse, AuthTokensPresenter } from '../presenters/auth-tokens.presenter';
import { UserHttpResponse, UserPresenter } from '../presenters/user.presenter';

/** Brute-force protection: much stricter limit than the global one. */
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly authenticateUser: AuthenticateUserUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logoutUser: LogoutUseCase,
    private readonly getProfile: GetProfileUseCase,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() body: RegisterDto): Promise<UserHttpResponse> {
    const result = await this.registerUser.execute(body);
    if (result.isLeft()) throw toHttpException(result.value);
    return UserPresenter.toHttp(result.value.user);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto): Promise<AuthTokensHttpResponse> {
    const result = await this.authenticateUser.execute(body);
    if (result.isLeft()) throw toHttpException(result.value);
    return AuthTokensPresenter.toHttp(result.value);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshTokenDto): Promise<AuthTokensHttpResponse> {
    const result = await this.refreshSession.execute(body);
    if (result.isLeft()) throw toHttpException(result.value);
    return AuthTokensPresenter.toHttp(result.value);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    await this.logoutUser.execute(body);
  }

  @ApiBearerAuth()
  @RequireScopes('profile:read')
  @Get('me')
  async me(@CurrentPrincipal() principal: Principal): Promise<UserHttpResponse> {
    const result = await this.getProfile.execute({ userId: principal.subject });
    if (result.isLeft()) throw toHttpException(result.value);
    return UserPresenter.toHttp(result.value.user);
  }
}

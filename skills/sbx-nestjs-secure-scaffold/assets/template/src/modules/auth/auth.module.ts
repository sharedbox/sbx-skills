import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypedConfigService } from '../../config/typed-config';
import { Clock } from '../../shared/application/ports/clock';
import { AccessTokenIssuer } from './application/ports/access-token-issuer';
import { OpaqueTokenService } from './application/ports/opaque-token-service';
import { PasswordHasher } from './application/ports/password-hasher';
import { SessionIssuer } from './application/services/session-issuer';
import { AuthenticateUserUseCase } from './application/use-cases/authenticate-user.use-case';
import { GetProfileUseCase } from './application/use-cases/get-profile.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { RefreshTokenRepository } from './domain/repositories/refresh-token.repository';
import { UserRepository } from './domain/repositories/user.repository';
import { RefreshTokenOrmEntity } from './infra/database/typeorm/entities/refresh-token.orm-entity';
import { UserOrmEntity } from './infra/database/typeorm/entities/user.orm-entity';
import { TypeOrmRefreshTokenRepository } from './infra/database/typeorm/repositories/typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from './infra/database/typeorm/repositories/typeorm-user.repository';
import { Argon2PasswordHasher } from './infra/security/argon2-password-hasher';
import { CryptoOpaqueTokenService } from './infra/security/crypto-opaque-token.service';
import { JwtAccessTokenIssuer } from './infra/security/jwt-access-token-issuer';
import { AuthController } from './presentation/controllers/auth.controller';

/** Composition root of the auth module. */
@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity, RefreshTokenOrmEntity])],
  controllers: [AuthController],
  providers: [
    // ports -> adapters
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    { provide: RefreshTokenRepository, useClass: TypeOrmRefreshTokenRepository },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: AccessTokenIssuer, useClass: JwtAccessTokenIssuer },
    { provide: OpaqueTokenService, useClass: CryptoOpaqueTokenService },
    // application services and use cases (plain classes, no decorators)
    {
      provide: SessionIssuer,
      inject: [RefreshTokenRepository, AccessTokenIssuer, OpaqueTokenService, Clock, ConfigService],
      useFactory: (
        refreshTokens: RefreshTokenRepository,
        accessTokens: AccessTokenIssuer,
        opaque: OpaqueTokenService,
        clock: Clock,
        config: TypedConfigService,
      ) =>
        new SessionIssuer(refreshTokens, accessTokens, opaque, clock, config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true })),
    },
    {
      provide: RegisterUserUseCase,
      inject: [UserRepository, PasswordHasher, ConfigService],
      useFactory: (users: UserRepository, hasher: PasswordHasher, config: TypedConfigService) =>
        new RegisterUserUseCase(users, hasher, config.get('DEFAULT_USER_SCOPES', { infer: true })),
    },
    {
      provide: AuthenticateUserUseCase,
      inject: [UserRepository, PasswordHasher, SessionIssuer],
      useFactory: (users: UserRepository, hasher: PasswordHasher, sessions: SessionIssuer) =>
        new AuthenticateUserUseCase(users, hasher, sessions),
    },
    {
      provide: RefreshSessionUseCase,
      inject: [RefreshTokenRepository, UserRepository, OpaqueTokenService, SessionIssuer, Clock],
      useFactory: (
        refreshTokens: RefreshTokenRepository,
        users: UserRepository,
        opaque: OpaqueTokenService,
        sessions: SessionIssuer,
        clock: Clock,
      ) => new RefreshSessionUseCase(refreshTokens, users, opaque, sessions, clock),
    },
    {
      provide: LogoutUseCase,
      inject: [RefreshTokenRepository, OpaqueTokenService, Clock],
      useFactory: (refreshTokens: RefreshTokenRepository, opaque: OpaqueTokenService, clock: Clock) =>
        new LogoutUseCase(refreshTokens, opaque, clock),
    },
    {
      provide: GetProfileUseCase,
      inject: [UserRepository],
      useFactory: (users: UserRepository) => new GetProfileUseCase(users),
    },
  ],
})
export class AuthModule {}

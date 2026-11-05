import {
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DomainError } from '@/core/errors/domain-error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { InvalidRefreshTokenError } from '../../domain/errors/invalid-refresh-token.error';
import { RefreshTokenReuseDetectedError } from '../../domain/errors/refresh-token-reuse-detected.error';
import { UserAlreadyExistsError } from '../../domain/errors/user-already-exists.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';

const logger = new Logger('AuthSecurity');
const body = (e: DomainError) => ({ code: e.code, message: e.message });
const invalidRefresh = new InvalidRefreshTokenError();

const errorMap = new Map<object, (e: DomainError) => HttpException>([
  [InvalidEmailError, (e) => new BadRequestException(body(e))],
  [UserAlreadyExistsError, (e) => new ConflictException({ code: e.code, message: 'E-mail already registered.' })],
  [InvalidCredentialsError, (e) => new UnauthorizedException(body(e))],
  [InvalidRefreshTokenError, (e) => new UnauthorizedException(body(e))],
  [
    RefreshTokenReuseDetectedError,
    () => {
      // security event for alerting (Loki/Grafana); the client gets the generic error
      logger.warn({ event: 'refresh_token_reuse_detected' }, 'Refresh token reuse detected; family revoked');
      return new UnauthorizedException(body(invalidRefresh));
    },
  ],
  [UserNotFoundError, (e) => new NotFoundException({ code: e.code, message: 'User not found.' })],
]);

export function toHttpException(error: DomainError): HttpException {
  const factory = errorMap.get(error.constructor);
  return factory ? factory(error) : new UnprocessableEntityException(body(error));
}

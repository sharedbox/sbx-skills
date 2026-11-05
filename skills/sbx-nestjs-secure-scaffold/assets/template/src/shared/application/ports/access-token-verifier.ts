import { Either } from '@/core/either';
import { InvalidAccessTokenError } from '../errors/invalid-access-token.error';
import { Principal } from '../principal';

export abstract class AccessTokenVerifier {
  abstract verify(token: string): Promise<Either<InvalidAccessTokenError, Principal>>;
}

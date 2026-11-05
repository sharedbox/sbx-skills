import { AuthTokens } from '../../application/services/session-issuer';

export interface AuthTokensHttpResponse {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export class AuthTokensPresenter {
  static toHttp(tokens: AuthTokens): AuthTokensHttpResponse {
    return {
      tokenType: tokens.tokenType,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
    };
  }
}

/** Claims carried by access tokens. `scope` is space-delimited (RFC 8693 / OAuth 2.0 style). */
export interface AccessTokenPayload {
  sub: string;
  scope: string;
  jti?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

export const ACCESS_TOKEN_ALGORITHM = 'HS256' as const;

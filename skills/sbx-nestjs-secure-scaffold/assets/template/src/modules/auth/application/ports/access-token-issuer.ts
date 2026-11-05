export interface IssuedAccessToken {
  token: string;
  expiresInSeconds: number;
}

export abstract class AccessTokenIssuer {
  abstract issue(claims: { subject: string; scopes: readonly string[] }): Promise<IssuedAccessToken>;
}

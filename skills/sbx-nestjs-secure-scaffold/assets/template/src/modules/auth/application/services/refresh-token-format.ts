/** Wire format of a refresh token: "<tokenId>.<secret>". The id allows lookup, the secret proves possession. */
export const formatRefreshToken = (id: string, secret: string): string => `${id}.${secret}`;

export function parseRefreshToken(raw: string): { id: string; secret: string } | null {
  const separator = raw.indexOf('.');
  if (separator <= 0 || separator === raw.length - 1) return null;
  return { id: raw.slice(0, separator), secret: raw.slice(separator + 1) };
}

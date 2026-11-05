/** The authenticated caller, as seen by use cases and controllers. */
export interface Principal {
  subject: string;
  scopes: readonly string[];
  tokenId?: string;
}

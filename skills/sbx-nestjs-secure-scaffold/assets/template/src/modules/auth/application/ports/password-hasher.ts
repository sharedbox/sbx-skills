export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(plain: string, hash: string): Promise<boolean>;
  /** Spends the same time as verify() when the user does not exist (prevents user enumeration by timing). */
  abstract verifyAgainstDummy(plain: string): Promise<void>;
}

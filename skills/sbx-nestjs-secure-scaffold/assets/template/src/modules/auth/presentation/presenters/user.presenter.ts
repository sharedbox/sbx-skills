import { User } from '../../domain/entities/user';

export interface UserHttpResponse {
  id: string;
  name: string;
  email: string;
  scopes: readonly string[];
  createdAt: string;
}

/** Explicit allow-list of fields: password hash and internal state never leave the API. */
export class UserPresenter {
  static toHttp(user: User): UserHttpResponse {
    return {
      id: user.id.toString(),
      name: user.name,
      email: user.email.toString(),
      scopes: user.scopes,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

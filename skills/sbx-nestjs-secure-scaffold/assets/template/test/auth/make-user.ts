import { User, UserProps } from '@/modules/auth/domain/entities/user';
import { Email } from '@/modules/auth/domain/value-objects/email';

export function makeUser(override: Partial<UserProps> = {}): User {
  return User.create({
    name: 'Jane Doe',
    email: Email.restore('jane@example.com'),
    passwordHash: 'hashed:correct horse battery',
    scopes: ['profile:read'],
    ...override,
  });
}

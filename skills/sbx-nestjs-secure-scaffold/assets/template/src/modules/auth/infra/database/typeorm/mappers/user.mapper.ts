import { UniqueEntityId } from '@/core/entities/unique-entity-id';
import { User } from '../../../../domain/entities/user';
import { Email } from '../../../../domain/value-objects/email';
import { UserOrmEntity } from '../entities/user.orm-entity';

export class UserMapper {
  static toDomain(raw: UserOrmEntity): User {
    return User.create(
      {
        name: raw.name,
        email: Email.restore(raw.email),
        passwordHash: raw.passwordHash,
        scopes: raw.scopes,
        isActive: raw.isActive,
        createdAt: raw.createdAt,
      },
      new UniqueEntityId(raw.id),
    );
  }

  static toPersistence(user: User): UserOrmEntity {
    const orm = new UserOrmEntity();
    orm.id = user.id.toString();
    orm.name = user.name;
    orm.email = user.email.toString();
    orm.passwordHash = user.passwordHash;
    orm.scopes = [...user.scopes];
    orm.isActive = user.isActive;
    orm.createdAt = user.createdAt;
    return orm;
  }
}

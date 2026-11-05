import { Entity } from '@/core/entities/entity';
import { UniqueEntityId } from '@/core/entities/unique-entity-id';
import { Email } from '../value-objects/email';

export interface UserProps {
  name: string;
  email: Email;
  passwordHash: string;
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
}

type CreateUserProps = Omit<UserProps, 'isActive' | 'createdAt'> &
  Partial<Pick<UserProps, 'isActive' | 'createdAt'>>;

export class User extends Entity<UserProps> {
  static create(props: CreateUserProps, id?: UniqueEntityId): User {
    return new User(
      {
        ...props,
        scopes: [...new Set(props.scopes)],
        isActive: props.isActive ?? true,
        createdAt: props.createdAt ?? new Date(),
      },
      id,
    );
  }

  get name(): string {
    return this.props.name;
  }

  get email(): Email {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get scopes(): readonly string[] {
    return this.props.scopes;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  canAuthenticate(): boolean {
    return this.props.isActive;
  }

  deactivate(): void {
    this.props.isActive = false;
  }
}

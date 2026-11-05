import { User } from '@/modules/auth/domain/entities/user';
import { UserRepository } from '@/modules/auth/domain/repositories/user.repository';

export class InMemoryUserRepository extends UserRepository {
  items: User[] = [];

  async findById(id: string): Promise<User | null> {
    return this.items.find((u) => u.id.toString() === id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.items.find((u) => u.email.toString() === email) ?? null;
  }

  async create(user: User): Promise<void> {
    this.items.push(user);
  }
}

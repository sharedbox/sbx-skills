import { Either, left, right } from '@/core/either';
import { User } from '../../domain/entities/user';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../../domain/repositories/user.repository';

export type GetProfileOutput = Either<UserNotFoundError, { user: User }>;

export class GetProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute({ userId }: { userId: string }): Promise<GetProfileOutput> {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) return left(new UserNotFoundError(userId));
    return right({ user });
  }
}

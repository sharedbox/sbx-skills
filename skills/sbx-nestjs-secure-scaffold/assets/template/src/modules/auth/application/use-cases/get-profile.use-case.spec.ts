import { InMemoryUserRepository } from '../../../../../test/auth/in-memory-user.repository';
import { makeUser } from '../../../../../test/auth/make-user';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { GetProfileUseCase } from './get-profile.use-case';

describe('GetProfileUseCase', () => {
  it('returns the active user', async () => {
    const users = new InMemoryUserRepository();
    const user = makeUser();
    users.items.push(user);

    const result = await new GetProfileUseCase(users).execute({ userId: user.id.toString() });

    expect(result.isRight()).toBe(true);
  });

  it('returns UserNotFoundError for unknown or inactive users', async () => {
    const users = new InMemoryUserRepository();
    const inactive = makeUser({ isActive: false });
    users.items.push(inactive);
    const sut = new GetProfileUseCase(users);

    expect((await sut.execute({ userId: 'missing' })).value).toBeInstanceOf(UserNotFoundError);
    expect((await sut.execute({ userId: inactive.id.toString() })).value).toBeInstanceOf(UserNotFoundError);
  });
});

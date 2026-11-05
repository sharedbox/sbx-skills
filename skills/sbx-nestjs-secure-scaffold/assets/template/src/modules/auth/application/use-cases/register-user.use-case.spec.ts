import { FakePasswordHasher } from '../../../../../test/auth/fakes';
import { InMemoryUserRepository } from '../../../../../test/auth/in-memory-user.repository';
import { makeUser } from '../../../../../test/auth/make-user';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { UserAlreadyExistsError } from '../../domain/errors/user-already-exists.error';
import { RegisterUserUseCase } from './register-user.use-case';

describe('RegisterUserUseCase', () => {
  let users: InMemoryUserRepository;
  let sut: RegisterUserUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    sut = new RegisterUserUseCase(users, new FakePasswordHasher(), ['profile:read']);
  });

  it('registers a user with hashed password and only the default scopes', async () => {
    const result = await sut.execute({ name: ' Ana ', email: 'Ana@Example.com', password: 'long passphrase' });

    expect(result.isRight()).toBe(true);
    expect(users.items).toHaveLength(1);
    expect(users.items[0].email.toString()).toBe('ana@example.com');
    expect(users.items[0].passwordHash).toBe('hashed:long passphrase');
    expect(users.items[0].scopes).toEqual(['profile:read']);
  });

  it('returns InvalidEmailError for a malformed e-mail', async () => {
    const result = await sut.execute({ name: 'Ana', email: 'nope', password: 'long passphrase' });

    expect(result.value).toBeInstanceOf(InvalidEmailError);
    expect(users.items).toHaveLength(0);
  });

  it('returns UserAlreadyExistsError for a taken e-mail', async () => {
    users.items.push(makeUser());

    const result = await sut.execute({ name: 'X', email: 'jane@example.com', password: 'long passphrase' });

    expect(result.value).toBeInstanceOf(UserAlreadyExistsError);
    expect(users.items).toHaveLength(1);
  });
});

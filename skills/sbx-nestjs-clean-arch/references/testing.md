# Testing use cases

Use cases are plain classes that depend on abstract ports, so they are tested by **instantiating them directly** with in-memory doubles. No `Test.createTestingModule`, no database, no HTTP — a use-case suite should run in milliseconds. If a use case can't be tested this way, that is a design smell (a hidden concrete dependency) — fix the design, not the test.

## What every use-case spec must cover

- The success path, asserting both the returned `Right` value **and** the side effect on the double (item stored, e-mail "sent", etc.).
- Every member of the `Left` union in the output type: assert `isLeft()`, `toBeInstanceOf(TheError)`, and that **no side effect happened** (nothing persisted).
- Domain behavior that the use case triggers (normalization, state transitions), through the entity's public API.

Name the subject `sut` (system under test) and build it in `beforeEach` so tests don't share state.

## Where doubles live

`test/<feature>/` — outside `src`, so they never ship and the architecture checker ignores them. Doubles `extends` the same port the real adapter extends, so TypeScript guarantees they honor the contract (LSP).

- **In-memory repositories** — a public `items` array to arrange and assert state.
- **Fakes** for other ports — deterministic, readable outputs (`hashed:<plain>`), so assertions don't depend on real crypto/clock.
- **Factories** (`makeUser(override)`) — valid default entities; override only what the test cares about.

Prefer fakes over `jest.fn()` mocks for ports: they test behavior (state) instead of call choreography, and survive refactors. Use `jest.spyOn` only to assert that something was *not* called or to simulate an adapter failure.

**`test/users/in-memory-user.repository.ts`**

```ts
import { User } from '@/modules/users/domain/entities/user';
import { UserRepository } from '@/modules/users/domain/repositories/user.repository';

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

  async save(user: User): Promise<void> {
    const index = this.items.findIndex((u) => u.id.equals(user.id));
    if (index >= 0) this.items[index] = user;
  }
}
```

**`test/users/fake-hash-generator.ts`**

```ts
import { HashGenerator } from '@/modules/users/application/ports/hash-generator';

export class FakeHashGenerator extends HashGenerator {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }
}
```

**`test/users/make-user.ts`**

```ts
import { UniqueEntityId } from '@/core/entities/unique-entity-id';
import { User, UserProps } from '@/modules/users/domain/entities/user';
import { Email } from '@/modules/users/domain/value-objects/email';

export function makeUser(override: Partial<UserProps> = {}, id?: UniqueEntityId): User {
  return User.create(
    {
      name: 'Jane Doe',
      email: Email.restore('jane@example.com'),
      passwordHash: 'hashed:secret123',
      ...override,
    },
    id,
  );
}
```

**`src/modules/users/application/use-cases/register-user.use-case.spec.ts`**

```ts
import { FakeHashGenerator } from '@test/users/fake-hash-generator';
import { InMemoryUserRepository } from '@test/users/in-memory-user.repository';
import { makeUser } from '@test/users/make-user';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { UserAlreadyExistsError } from '../../domain/errors/user-already-exists.error';
import { RegisterUserUseCase } from './register-user.use-case';

describe('RegisterUserUseCase', () => {
  let users: InMemoryUserRepository;
  let sut: RegisterUserUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    sut = new RegisterUserUseCase(users, new FakeHashGenerator());
  });

  it('registers a user with a hashed password', async () => {
    const result = await sut.execute({
      name: ' John ',
      email: 'John@Example.com',
      password: 'secret123',
    });

    expect(result.isRight()).toBe(true);
    expect(users.items).toHaveLength(1);
    expect(users.items[0].name).toBe('John');
    expect(users.items[0].email.toString()).toBe('john@example.com');
    expect(users.items[0].passwordHash).toBe('hashed:secret123');
  });

  it('returns InvalidEmailError for a malformed e-mail', async () => {
    const result = await sut.execute({ name: 'John', email: 'nope', password: 'secret123' });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(InvalidEmailError);
    expect(users.items).toHaveLength(0);
  });

  it('returns UserAlreadyExistsError when the e-mail is taken', async () => {
    users.items.push(makeUser());

    const result = await sut.execute({
      name: 'Other',
      email: 'jane@example.com',
      password: 'secret123',
    });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(UserAlreadyExistsError);
    expect(users.items).toHaveLength(1);
  });
});
```

**`src/modules/users/application/use-cases/get-user-by-id.use-case.spec.ts`**

```ts
import { InMemoryUserRepository } from '@test/users/in-memory-user.repository';
import { makeUser } from '@test/users/make-user';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { GetUserByIdUseCase } from './get-user-by-id.use-case';

describe('GetUserByIdUseCase', () => {
  let users: InMemoryUserRepository;
  let sut: GetUserByIdUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    sut = new GetUserByIdUseCase(users);
  });

  it('returns the user', async () => {
    const user = makeUser();
    users.items.push(user);

    const result = await sut.execute({ id: user.id.toString() });

    expect(result.isRight()).toBe(true);
    if (result.isRight()) expect(result.value.user.equals(user)).toBe(true);
  });

  it('returns UserNotFoundError for an unknown id', async () => {
    const result = await sut.execute({ id: 'missing' });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(UserNotFoundError);
  });
});
```


## Domain unit tests

Value objects and entities with real logic get their own `*.spec.ts` next to them (e.g. `email.spec.ts`: valid, normalized, invalid → `Left`).

## Optional: e2e tests for wiring

Unit tests prove the rules; an e2e test proves the module wiring, DTO validation and error mapping. Keep them few. Example using SQLite in memory (`npm i -D sqlite3 supertest @types/supertest @nestjs/testing`):

**`test/users/users.e2e.spec.ts`**

```ts
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { UsersModule } from '@/modules/users/users.module';

describe('Users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', autoLoadEntities: true, synchronize: true }),
        UsersModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /users -> 201, then 409 on duplicate, 400 on invalid body, GET -> 200/404', async () => {
    const created = await request(app.getHttpServer())
      .post('/users').send({ name: 'Ana', email: 'ana@example.com', password: 'secret123' });
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty('passwordHash');

    const dup = await request(app.getHttpServer())
      .post('/users').send({ name: 'Ana', email: 'ana@example.com', password: 'secret123' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('USER_ALREADY_EXISTS');

    const bad = await request(app.getHttpServer()).post('/users').send({ name: 'x', email: 'bad', password: '1', admin: true });
    expect(bad.status).toBe(400);

    const found = await request(app.getHttpServer()).get(`/users/${created.body.id}`);
    expect(found.status).toBe(200);
    expect(found.body.email).toBe('ana@example.com');

    const missing = await request(app.getHttpServer()).get('/users/1b4e28ba-2fa1-41d2-883f-0016d3cca427');
    expect(missing.status).toBe(404);
  });
});
```


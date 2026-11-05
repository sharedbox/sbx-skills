# Layer templates (verified)

Every snippet below comes from a sample project that was type-checked with `strict: true`, unit-tested with Jest, and exercised end-to-end (201 / 400 / 404 / 409) against a real database. Copy the shapes; rename the feature. The example feature is `users` (register + get by id).

Path aliases used: `@/*` → `src/*`, `@test/*` → `test/*` (set in `tsconfig.json` `paths` and in Jest `moduleNameMapper`). Inside a module, prefer relative imports; use `@/core/...` for the shared core.

## Contents
1. Core building blocks (`src/core`)
2. Domain layer
3. Application layer
4. Infra layer (TypeORM + adapters)
5. Presentation layer
6. Composition root (module), `app.module.ts`, `main.ts`
7. Required tsconfig / jest settings
8. Variations: update, delete, list/pagination, transactions, cross-module access
9. Refactoring a fat service

---

## 1. Core building blocks

These are written once per project and reused by every module. They import nothing but Node built-ins.


**`src/core/either.ts`** — success/failure as values; `isLeft()`/`isRight()` narrow the type

```ts
export class Left<L, R> {
  constructor(readonly value: L) {}

  isLeft(): this is Left<L, R> {
    return true;
  }

  isRight(): this is Right<L, R> {
    return false;
  }
}

export class Right<L, R> {
  constructor(readonly value: R) {}

  isLeft(): this is Left<L, R> {
    return false;
  }

  isRight(): this is Right<L, R> {
    return true;
  }
}

export type Either<L, R> = Left<L, R> | Right<L, R>;

export const left = <L, R = never>(value: L): Either<L, R> => new Left<L, R>(value);
export const right = <R, L = never>(value: R): Either<L, R> => new Right<L, R>(value);
```

**`src/core/entities/unique-entity-id.ts`**

```ts
import { randomUUID } from 'node:crypto';

export class UniqueEntityId {
  private readonly value: string;

  constructor(value?: string) {
    this.value = value ?? randomUUID();
  }

  toString(): string {
    return this.value;
  }

  equals(other: UniqueEntityId): boolean {
    return other.toString() === this.value;
  }
}
```

**`src/core/entities/entity.ts`** — identity-based equality; props are protected so state only changes through behavior methods

```ts
import { UniqueEntityId } from './unique-entity-id';

export abstract class Entity<Props> {
  private readonly _id: UniqueEntityId;
  protected props: Props;

  protected constructor(props: Props, id?: UniqueEntityId) {
    this.props = props;
    this._id = id ?? new UniqueEntityId();
  }

  get id(): UniqueEntityId {
    return this._id;
  }

  equals(other: Entity<unknown>): boolean {
    return other === this || other.id.equals(this._id);
  }
}
```

**`src/core/errors/domain-error.ts`**

```ts
/**
 * Base class for expected business failures.
 * Instances are RETURNED inside Left(...), never thrown.
 */
export abstract class DomainError {
  abstract readonly code: string;

  constructor(readonly message: string) {}
}
```


---

## 2. Domain layer

Rules: pure TypeScript; no decorators; no framework imports; no `throw`. Entities expose **behavior** (`rename`, `deactivate`), not public setters. Validated primitives become value objects whose `create()` returns `Either`. Every expected failure is its own `DomainError` subclass with a stable `code`.


**`src/modules/users/domain/errors/invalid-email.error.ts`**

```ts
import { DomainError } from '@/core/errors/domain-error';

export class InvalidEmailError extends DomainError {
  readonly code = 'INVALID_EMAIL';

  constructor(email: string) {
    super(`"${email}" is not a valid e-mail address.`);
  }
}
```

**`src/modules/users/domain/errors/user-already-exists.error.ts`**

```ts
import { DomainError } from '@/core/errors/domain-error';

export class UserAlreadyExistsError extends DomainError {
  readonly code = 'USER_ALREADY_EXISTS';

  constructor(email: string) {
    super(`A user with e-mail "${email}" already exists.`);
  }
}
```

**`src/modules/users/domain/errors/user-not-found.error.ts`**

```ts
import { DomainError } from '@/core/errors/domain-error';

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';

  constructor(id: string) {
    super(`User "${id}" was not found.`);
  }
}
```

**`src/modules/users/domain/value-objects/email.ts`** — `create` validates, `restore` rehydrates trusted data from storage

```ts
import { Either, left, right } from '@/core/either';
import { InvalidEmailError } from '../errors/invalid-email.error';

export class Email {
  private constructor(private readonly value: string) {}

  static create(raw: string): Either<InvalidEmailError, Email> {
    const normalized = raw.trim().toLowerCase();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!isValid) {
      return left(new InvalidEmailError(raw));
    }
    return right(new Email(normalized));
  }

  /** Rebuilds an already-validated value (used by mappers when loading from storage). */
  static restore(value: string): Email {
    return new Email(value);
  }

  toString(): string {
    return this.value;
  }
}
```

**`src/modules/users/domain/entities/user.ts`**

```ts
import { Entity } from '@/core/entities/entity';
import { UniqueEntityId } from '@/core/entities/unique-entity-id';
import { Email } from '../value-objects/email';

export interface UserProps {
  name: string;
  email: Email;
  passwordHash: string;
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

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  rename(name: string): void {
    this.props.name = name.trim();
  }

  deactivate(): void {
    this.props.isActive = false;
  }
}
```

**`src/modules/users/domain/repositories/user.repository.ts`** — port: only the methods use cases need (ISP)

```ts
import { User } from '../entities/user';

/**
 * Port. Abstract class (not interface) so it can be used as a Nest DI token
 * without the domain importing anything from Nest.
 */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract create(user: User): Promise<void>;
  abstract save(user: User): Promise<void>;
}
```


---

## 3. Application layer

Rules: one class per use case, one public method `execute(input): Promise<Either<...>>`. Constructor receives **ports** only. No decorators, no `@Injectable()` — the module builds use cases with `useFactory`. The `Left` union in the output type lists every failure the caller must handle; keep it exhaustive.

Non-persistence needs (hashing, tokens, mail, clock, external APIs) get their own port in `application/ports/`.


**`src/modules/users/application/ports/hash-generator.ts`**

```ts
export abstract class HashGenerator {
  abstract hash(plain: string): Promise<string>;
}
```

**`src/modules/users/application/use-cases/register-user.use-case.ts`**

```ts
import { Either, left, right } from '@/core/either';
import { User } from '../../domain/entities/user';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { UserAlreadyExistsError } from '../../domain/errors/user-already-exists.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { HashGenerator } from '../ports/hash-generator';

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export type RegisterUserOutput = Either<
  InvalidEmailError | UserAlreadyExistsError,
  { user: User }
>;

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: HashGenerator,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const emailOrError = Email.create(input.email);
    if (emailOrError.isLeft()) {
      return left(emailOrError.value);
    }
    const email = emailOrError.value;

    const existing = await this.users.findByEmail(email.toString());
    if (existing) {
      return left(new UserAlreadyExistsError(email.toString()));
    }

    const user = User.create({
      name: input.name.trim(),
      email,
      passwordHash: await this.hasher.hash(input.password),
    });

    await this.users.create(user);

    return right({ user });
  }
}
```

**`src/modules/users/application/use-cases/get-user-by-id.use-case.ts`**

```ts
import { Either, left, right } from '@/core/either';
import { User } from '../../domain/entities/user';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../../domain/repositories/user.repository';

export interface GetUserByIdInput {
  id: string;
}

export type GetUserByIdOutput = Either<UserNotFoundError, { user: User }>;

export class GetUserByIdUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute({ id }: GetUserByIdInput): Promise<GetUserByIdOutput> {
    const user = await this.users.findById(id);
    if (!user) {
      return left(new UserNotFoundError(id));
    }
    return right({ user });
  }
}
```


---

## 4. Infra layer

Rules: adapters `extends` the port (so the class is type-checked against the contract) and may use any framework. ORM models are separate classes from domain entities; a mapper converts both ways. Repositories never leak `Repository<T>`, query builders or ORM models outside infra.


**`src/modules/users/infra/database/typeorm/entities/user.orm-entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('users')
export class UserOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

**`src/modules/users/infra/database/typeorm/mappers/user.mapper.ts`**

```ts
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
    orm.isActive = user.isActive;
    orm.createdAt = user.createdAt;
    return orm;
  }
}
```

**`src/modules/users/infra/database/typeorm/repositories/typeorm-user.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../../domain/entities/user';
import { UserRepository } from '../../../../domain/repositories/user.repository';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class TypeOrmUserRepository extends UserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly orm: Repository<UserOrmEntity>,
  ) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    const raw = await this.orm.findOne({ where: { id } });
    return raw ? UserMapper.toDomain(raw) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const raw = await this.orm.findOne({ where: { email } });
    return raw ? UserMapper.toDomain(raw) : null;
  }

  async create(user: User): Promise<void> {
    await this.orm.insert(UserMapper.toPersistence(user));
  }

  async save(user: User): Promise<void> {
    await this.orm.save(UserMapper.toPersistence(user));
  }
}
```

**`src/modules/users/infra/cryptography/bcrypt-hash-generator.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { HashGenerator } from '../../application/ports/hash-generator';

@Injectable()
export class BcryptHashGenerator extends HashGenerator {
  private static readonly SALT_ROUNDS = 10;

  hash(plain: string): Promise<string> {
    return hash(plain, BcryptHashGenerator.SALT_ROUNDS);
  }
}
```


---

## 5. Presentation layer

Rules: DTOs validate **shape** (types, lengths, formats) with `class-validator`; business rules (uniqueness, state transitions) stay in the domain/use case. Controllers are thin: DTO → `execute()` → map `Left` → presenter. Presenters decide the HTTP shape (never leak `passwordHash`, ORM fields, or the entity itself). One error mapper per module turns `DomainError` into `HttpException`; throwing *here* is fine because this is the framework boundary.


**`src/modules/users/presentation/dtos/register-user.dto.ts`**

```ts
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

**`src/modules/users/presentation/presenters/user.presenter.ts`**

```ts
import { User } from '../../domain/entities/user';

export interface UserHttpResponse {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export class UserPresenter {
  static toHttp(user: User): UserHttpResponse {
    return {
      id: user.id.toString(),
      name: user.name,
      email: user.email.toString(),
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
```

**`src/modules/users/presentation/errors/domain-error.mapper.ts`** — a map instead of an if/else chain keeps it open for extension

```ts
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DomainError } from '@/core/errors/domain-error';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { UserAlreadyExistsError } from '../../domain/errors/user-already-exists.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';

type HttpExceptionFactory = (error: DomainError) => HttpException;

/** Open for extension: add a new error by adding an entry, no if/else chain to edit. */
const errorMap = new Map<Function, HttpExceptionFactory>([
  [InvalidEmailError, (e) => new BadRequestException({ code: e.code, message: e.message })],
  [UserAlreadyExistsError, (e) => new ConflictException({ code: e.code, message: e.message })],
  [UserNotFoundError, (e) => new NotFoundException({ code: e.code, message: e.message })],
]);

export function toHttpException(error: DomainError): HttpException {
  const factory = errorMap.get(error.constructor);
  return factory
    ? factory(error)
    : new UnprocessableEntityException({ code: error.code, message: error.message });
}
```

**`src/modules/users/presentation/controllers/users.controller.ts`**

```ts
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { GetUserByIdUseCase } from '../../application/use-cases/get-user-by-id.use-case';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import { RegisterUserDto } from '../dtos/register-user.dto';
import { toHttpException } from '../errors/domain-error.mapper';
import { UserHttpResponse, UserPresenter } from '../presenters/user.presenter';

@Controller('users')
export class UsersController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly getUserById: GetUserByIdUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  async register(@Body() body: RegisterUserDto): Promise<UserHttpResponse> {
    const result = await this.registerUser.execute(body);
    if (result.isLeft()) {
      throw toHttpException(result.value);
    }
    return UserPresenter.toHttp(result.value.user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserHttpResponse> {
    const result = await this.getUserById.execute({ id });
    if (result.isLeft()) {
      throw toHttpException(result.value);
    }
    return UserPresenter.toHttp(result.value.user);
  }
}
```


---

## 6. Composition root

The module file is the only place inside a feature that may import from every layer. Ports are bound to adapters with `useClass`; use cases are built with `useFactory` + `inject` so they never need Nest decorators.


**`src/modules/users/users.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HashGenerator } from './application/ports/hash-generator';
import { GetUserByIdUseCase } from './application/use-cases/get-user-by-id.use-case';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { UserRepository } from './domain/repositories/user.repository';
import { BcryptHashGenerator } from './infra/cryptography/bcrypt-hash-generator';
import { UserOrmEntity } from './infra/database/typeorm/entities/user.orm-entity';
import { TypeOrmUserRepository } from './infra/database/typeorm/repositories/typeorm-user.repository';
import { UsersController } from './presentation/controllers/users.controller';

/** Composition root: the only place in the module that knows every layer. */
@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity])],
  controllers: [UsersController],
  providers: [
    // ports -> adapters
    { provide: UserRepository, useClass: TypeOrmUserRepository },
    { provide: HashGenerator, useClass: BcryptHashGenerator },
    // use cases are plain classes, built with factories (no decorators in the core)
    {
      provide: RegisterUserUseCase,
      useFactory: (users: UserRepository, hasher: HashGenerator) =>
        new RegisterUserUseCase(users, hasher),
      inject: [UserRepository, HashGenerator],
    },
    {
      provide: GetUserByIdUseCase,
      useFactory: (users: UserRepository) => new GetUserByIdUseCase(users),
      inject: [UserRepository],
    },
  ],
  exports: [UserRepository],
})
export class UsersModule {}
```

**`src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
    UsersModule,
  ],
})
export class AppModule {}
```

**`src/main.ts`** — the global ValidationPipe is required for DTOs to be enforced

```ts
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
```


---

## 7. Required tsconfig / jest settings

```jsonc
// tsconfig.json (relevant parts)
{
  "compilerOptions": {
    "strict": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false, // ORM entities and DTOs are filled by the framework
    "baseUrl": "./",
    "paths": { "@/*": ["src/*"], "@test/*": ["test/*"] }
  }
}
```

```jsonc
// package.json -> "jest"
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.ts$": "ts-jest" },
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1", "^@test/(.*)$": "<rootDir>/test/$1" },
  "testEnvironment": "node"
}
```

---

## 8. Variations

**Update** — load → call entity behavior → save. The entity enforces its invariants; the use case orchestrates.

```ts
export class RenameUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(input: { id: string; name: string }): Promise<Either<UserNotFoundError, { user: User }>> {
    const user = await this.users.findById(input.id);
    if (!user) return left(new UserNotFoundError(input.id));
    user.rename(input.name);
    await this.users.save(user);
    return right({ user });
  }
}
```

**Delete** — return `Either<NotFoundError, null>`; controller uses `@HttpCode(204)` and returns nothing.

**List / pagination** — add a narrow method to the port with a domain-level params type; never expose TypeORM `FindOptions`.

```ts
// domain/repositories/pagination.ts (or src/core/pagination.ts if shared)
export interface PaginationParams { page: number; perPage: number }
export interface Paginated<T> { items: T[]; total: number; page: number; perPage: number }

// in the port
abstract findMany(params: PaginationParams): Promise<Paginated<User>>;
```

The query DTO (`@Type(() => Number) @IsInt() @Min(1) page = 1`) lives in `presentation/dtos/`, and the controller converts it into `PaginationParams`.

**Transactions / unit of work** — declare a port in the core and implement it with TypeORM's `DataSource.transaction` in infra:

```ts
// application/ports/unit-of-work.ts
export abstract class UnitOfWork {
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}
```

The infra implementation can keep the transactional `EntityManager` in `AsyncLocalStorage` so repositories pick it up — the use case only sees `uow.run(...)`.

**Cross-module access** — module A needs data from module B: inject B's **port** (exported from B's module: `exports: [UserRepository]`) or, better, a use case of B, or a dedicated port in A (`application/ports/user-lookup.ts`) implemented in A's infra by calling B's exported provider. Never import B's `infra/` or `presentation/`.

**Domain events / side effects** (e-mail after registration, etc.) — a `Mailer` or `EventPublisher` port in `application/ports/`; the adapter in infra may use `@nestjs/event-emitter`, a queue, etc.

**Auth** — guards, strategies and `@CurrentUser()` decorators are presentation/infra concerns. Token signing is an `Encrypter` port; password comparison is a `HashComparer` port. The authenticate use case returns `Either<WrongCredentialsError, { accessToken }>`.

---

## 9. Refactoring a fat service

Typical starting point: `UsersService` with `@InjectRepository(User)`, `throw new NotFoundException(...)`, validation `if`s, and a TypeORM entity used everywhere.

1. List the service's public methods — each becomes a use case.
2. Split the TypeORM entity into a domain entity (`domain/entities`) + ORM model (`infra/.../entities`) + mapper.
3. Create the repository port with exactly the queries those use cases need; implement it in infra by moving the existing TypeORM calls there.
4. Replace every `throw new XxxException` that represents a business outcome with a `DomainError` returned in `left(...)`; add it to the presentation error mapper with the same HTTP status the old code produced (behavior must not change).
5. Move format validation to DTOs and invariant validation to value objects/entities.
6. Point the controller at the use cases, add presenters, wire the module with `useFactory`, delete the service.
7. Write use-case unit tests with in-memory doubles; run the checker script.

# Pre-delivery checklist

Go through every item before presenting code. If an item fails, fix the code — don't just mention it.

## Automated
- [ ] `python3 <skill-dir>/scripts/check_architecture.py <project-root>` reports **0 errors** (warnings reviewed and justified or fixed).
- [ ] TypeScript compiles (`npx tsc --noEmit`) if the project is available.
- [ ] Unit tests pass (`npx jest`) if the project is available.

## Dependency rule
- [ ] `domain/` imports only `domain/` and `src/core/`.
- [ ] `application/` imports only `application/`, `domain/`, `src/core/`.
- [ ] `infra/` never imports `presentation/`; `presentation/` never imports `infra/`.
- [ ] No module imports another module's `infra/` or `presentation/`.
- [ ] Only `<feature>.module.ts`, `app.module.ts` and `main.ts` see every layer.

## Core purity
- [ ] No `@nestjs/*`, `typeorm`, `class-validator`, `class-transformer`, `express`, `bcrypt*`, HTTP/queue/cache clients in `domain/`, `application/`, `src/core/`.
- [ ] No decorators in the core (including `@Injectable()`); use cases are built with `useFactory`.
- [ ] No `throw` in the core; every expected failure is a `DomainError` returned in `left(...)`.
- [ ] Output types list every possible `Left` (`Either<ErrorA | ErrorB, Success>`).
- [ ] No `process.env`, `any`, or concrete adapters in the core.

## SOLID
- [ ] Each use case does one thing and has one public `execute()`.
- [ ] Constructors receive abstractions (ports), never instantiate dependencies.
- [ ] Ports are small and contain only methods some use case calls.
- [ ] Adapters and doubles `extends` their port and honor the same semantics (e.g. `null` when not found).
- [ ] No `switch`/`if` on variant types in the core where a new adapter/strategy should be added instead.

## Domain modeling
- [ ] Entities have private/protected state and behavior methods; no public setters.
- [ ] Validated primitives (e-mail, money, document numbers…) are value objects with `create(): Either`.
- [ ] ORM models are separate from domain entities, converted by a mapper both ways.
- [ ] Repositories return domain entities, never ORM models.

## Presentation
- [ ] Request DTOs use `class-validator`; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` is configured.
- [ ] Controllers only: DTO → `execute()` → map `Left` → presenter.
- [ ] Responses go through a presenter; no entity, ORM model or sensitive field (password hash, internal ids) leaks.
- [ ] Every `DomainError` is mapped to an explicit HTTP status in the module's error mapper.

## Tests
- [ ] Every new/changed use case has a `.spec.ts` covering success and every `Left`.
- [ ] Tests use in-memory repositories/fakes from `test/<feature>/`, not the Nest testing module or a database.
- [ ] Failure tests assert that no side effect happened.

## Communication
- [ ] If the user asked for something that would break a rule, the reply says which rule, why, and what was done instead.
- [ ] Existing violations found nearby were pointed out (not copied).

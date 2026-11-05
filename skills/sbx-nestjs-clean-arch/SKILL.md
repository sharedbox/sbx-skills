---
name: sbx-nestjs-clean-arch
description: Build and refactor NestJS APIs that strictly follow SOLID principles and Clean Architecture (domain / application / infra / presentation layers, dependency rule, ports and adapters, Either for errors, TypeORM behind repository ports, class-validator DTOs, unit-tested use cases). Use this skill whenever the user is writing, generating, reviewing or refactoring NestJS code — new modules, endpoints, CRUDs, services, repositories, entities, controllers, use cases, auth, or "just a quick endpoint" — even if they don't mention SOLID or Clean Architecture, and also when they ask to review a NestJS codebase for architecture or coupling problems.
---

# NestJS + SOLID + Clean Architecture

This skill produces NestJS code in which **the business core does not know NestJS, TypeORM or HTTP exist**. Everything else in this file follows from that one sentence.

The architecture is not a style preference here — it is a hard constraint. The user chose it so that the core stays testable without a database, frameworks stay replaceable, and every feature looks the same. A single "temporary" shortcut (a controller using `Repository<T>`, a use case importing `@nestjs/common`) breaks those guarantees for the whole module and invites the next shortcut. So: **never produce code that violates the rules below, even when asked for something quick.** If a request can only be satisfied by violating them, explain the conflict in one or two sentences and deliver the compliant version instead (see "When a request conflicts with the rules").

## The non-negotiable rules

1. **Dependency rule.** Dependencies point inward only:
   `presentation → application → domain` and `infra → application → domain`.
   - `domain` imports only `domain` and `src/core`.
   - `application` imports only `application`, `domain` and `src/core`.
   - `infra` never imports `presentation`; `presentation` never imports `infra`.
   - The only file allowed to see every layer is the module's composition root (`<feature>.module.ts`) and `src/app.module.ts` / `src/main.ts`.
2. **Framework-free core.** Files in `domain/`, `application/` and `src/core/` never import `@nestjs/*`, `typeorm`, `class-validator`, `class-transformer`, `express`, `bcrypt`, HTTP clients, or any other infrastructure package. No decorators there — not even `@Injectable()`. Use cases are wired with `useFactory` in the module (see `references/layers.md`).
3. **Ports and adapters (DIP).** Anything the core needs from the outside world (persistence, hashing, tokens, mail, clock, queues, external APIs) is an **abstract class** declared in the core (`domain/repositories/` or `application/ports/`) and implemented in `infra/`. Abstract classes double as Nest DI tokens without the core importing Nest.
4. **Errors are values.** Expected business failures are returned as `Either<Error, Success>` (`left` / `right` from `src/core/either.ts`). Domain and application code never `throw`. Presentation translates `Left` values into HTTP exceptions in one place.
5. **ORM models are not domain entities.** TypeORM `@Entity` classes live in `infra/database/typeorm/entities/` and are converted with a mapper (`toDomain` / `toPersistence`). Repositories return domain entities, never ORM models or `Repository<T>`.
6. **DTOs live at the edge.** Request DTOs with `class-validator` live in `presentation/dtos/`. Responses are shaped by presenters (`presentation/presenters/`); never return a domain entity or ORM model straight from a controller.
7. **Every use case has unit tests** that run with in-memory repositories and fake adapters — no Nest testing module, no database. Cover the success path and every `Left` the use case can return.
8. **SOLID at class level.** One use case = one class = one public `execute()` (SRP). Add behavior by adding use cases/adapters, not by growing `if` chains (OCP). Adapters fully honor their port's contract (LSP). Ports are small and client-specific (ISP). Constructors receive abstractions, never `new` a dependency (DIP). Details and violation examples: `references/solid.md`.

## Folder structure (per feature module)

```
src/
├── core/                         # shared, framework-free building blocks
│   ├── either.ts
│   ├── entities/entity.ts
│   ├── entities/unique-entity-id.ts
│   └── errors/domain-error.ts
├── modules/
│   └── <feature>/
│       ├── domain/
│       │   ├── entities/         # entities, aggregates (pure TS)
│       │   ├── value-objects/
│       │   ├── errors/           # business errors (returned, not thrown)
│       │   └── repositories/     # repository ports (abstract classes)
│       ├── application/
│       │   ├── ports/            # non-persistence ports (HashGenerator, Mailer…)
│       │   └── use-cases/        # one file per use case + .spec.ts
│       ├── infra/
│       │   ├── database/typeorm/{entities,mappers,repositories}/
│       │   └── <adapter>/        # e.g. cryptography/, mail/
│       ├── presentation/
│       │   ├── controllers/
│       │   ├── dtos/
│       │   ├── presenters/
│       │   └── errors/           # Left → HttpException mapping
│       └── <feature>.module.ts   # composition root
├── config/                       # env/config loading (infra-level, outside modules)
├── app.module.ts
└── main.ts
test/
└── <feature>/                    # in-memory repositories, fakes, factories
```

If the user's project already uses a different but equivalent layout, keep their names — the rules are about direction of dependencies, not folder spelling. Tell the checker script about it only if it can't infer the layers.

## Workflow for a new feature

Build inside-out. Writing the core first keeps it from being shaped by the database or the HTTP API.

1. **Domain.** Entities with private props, a static `create()` factory, behavior methods (not just getters/setters), value objects for validated primitives (`Email.create()` returns `Either`). Business errors extending `DomainError`. Repository port with only the methods the use cases need.
2. **Application.** Ports for other external needs. One use case per action, with explicit `Input` and `Output` types where `Output = Either<...>`. Write the `.spec.ts` with in-memory doubles alongside it.
3. **Infra.** TypeORM entity, mapper, repository implementation (`extends` the port, `@Injectable()`), other adapters.
4. **Presentation.** DTO with `class-validator`, controller that only: receives the DTO → calls `useCase.execute()` → maps `Left` via the error mapper → returns a presenter's output. No business rules, no `if` on domain state.
5. **Composition root.** `<feature>.module.ts` binds `{ provide: Port, useClass: Adapter }` and builds use cases with `useFactory`. Ensure a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` exists in `main.ts`.
6. **Verify** before presenting the result:
   - Run `python3 <skill-dir>/scripts/check_architecture.py <project-root>` (it checks the dependency rule, framework imports in the core, `throw` in the core, cross-module leaks, and files living outside any layer). Fix every error it reports.
   - Run the unit tests if the project can run them.
   - Walk through `references/checklist.md`.

Full code for every step (Either, base entity, entity, value object, port, use case, TypeORM entity/mapper/repository, DTO, controller, presenter, error mapper, module, tests) is in `references/layers.md` and `references/testing.md`. Read them before writing the first file of a feature — copying their shape keeps every module consistent.

## When a request conflicts with the rules

Users will sometimes ask for shortcuts: "just inject the TypeORM repository in the controller", "put the logic in the service", "throw a NotFoundException from the use case", "return the entity directly". Don't comply silently and don't refuse to help. Do this:

1. Say briefly which rule it breaks and the concrete cost (e.g. "the use case would depend on HTTP, so it can't be reused by a queue consumer or tested without Nest").
2. Deliver the compliant version that achieves what they actually want (a fast endpoint, a 404, less boilerplate).
3. If the real worry is boilerplate, reduce it within the rules (shared base classes in `core`, a generic in-memory repository for tests, a single error mapper) rather than by crossing layers.

Example — user: "make the use case throw NotFoundException so I get a 404."
Response: return `left(new OrderNotFoundError(id))` from the use case and map `OrderNotFoundError → NotFoundException` in `presentation/errors/`; the HTTP result is identical and the use case stays HTTP-agnostic.

## Working in an existing codebase

- Read the existing module layout first and match its naming.
- If existing code already violates the rules, **do not copy the violation into new code**. Write the new code compliantly, and point out the existing violations with a short refactor suggestion (or refactor them if the user asked for it).
- When refactoring a "fat service": extract each public method into a use case, extract persistence behind a port, move validation to DTOs/value objects, and replace thrown business exceptions with `Either` — then delete the service. See the refactoring section in `references/layers.md`.

## Reference files

- `references/layers.md` — complete code templates for every layer, the module wiring, `main.ts`, and how to refactor a fat service. Read before writing code.
- `references/solid.md` — each SOLID principle applied to NestJS, with violation → fix examples. Read when designing classes or reviewing code.
- `references/testing.md` — unit-testing use cases with in-memory repositories and fakes, test factories, what to assert.
- `references/checklist.md` — the final review checklist. Run through it before delivering.
- `scripts/check_architecture.py` — static checker for the dependency rule. `python3 scripts/check_architecture.py <project-root> [--src src]`; exits non-zero on violations.

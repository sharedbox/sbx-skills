# SOLID in NestJS

Each principle: what it means here, the typical NestJS violation, and the fix. Use the "smell" lines when reviewing code.

## S — Single Responsibility

A class has one reason to change.

- **Use cases:** one business action per class, one public `execute()`. `UsersService` with `create/update/delete/list/login` has five reasons to change → five use cases.
- **Controllers:** translate HTTP ↔ use case only. Hashing, uniqueness checks or `if (user.status === ...)` in a controller is business logic in the wrong place.
- **Mappers / presenters:** conversion only, no queries, no rules.

Smells: classes named `*Service`/`*Manager`/`*Helper` with many methods; a constructor with 5+ dependencies; a method that both validates, persists and sends e-mail.

```ts
// ✗ violation
@Injectable()
export class OrdersService {
  constructor(@InjectRepository(Order) private repo: Repository<Order>, private mail: MailerService) {}
  async create(dto: CreateOrderDto) { /* validate, price, save, e-mail */ }
  async cancel(id: string) { /* ... */ }
  async list() { /* ... */ }
}

// ✓ fix: PlaceOrderUseCase, CancelOrderUseCase, ListOrdersUseCase — each with only the ports it needs
```

## O — Open/Closed

Add behavior by adding code, not by editing working code.

- New payment method → new `PaymentGateway` adapter + binding, not a new `case` in a `switch` inside the use case.
- New domain error → new class + one entry in the presentation error map.
- Pricing/discount rules that vary → a strategy port (`DiscountPolicy`) with several implementations, selected in the composition root or by a factory in infra.

Smells: `switch (type)` / `if (provider === 'stripe')` in domain/application code; editing a use case every time a variant is added.

## L — Liskov Substitution

Any implementation of a port can replace any other without the caller noticing.

- Adapters and test doubles `extends` the port, so signatures are compiler-checked.
- Honor the **semantic** contract too: if `findById` returns `null` when missing, no adapter may throw instead; if `create` must reject duplicates via the use case, the in-memory repo must not silently dedupe either.
- Infra exceptions (connection lost) are not business outcomes — they may propagate, but an adapter must never convert a normal "not found" into an exception or vice-versa.

Smells: `if (repo instanceof TypeOrmUserRepository)`; an adapter method that throws `NotImplemented`; a fake that behaves differently from the real adapter on edge cases.

## I — Interface Segregation

Clients depend only on what they use.

- Ports are per-need: `HashGenerator` and `HashComparer` instead of one `CryptoService`; a `UserRepository` with only the queries use cases call — not a generic `BaseRepository<T>` with 20 methods.
- If a use case needs only reading, consider a narrower port (`UserReader`) instead of injecting the whole repository.
- Never expose ORM-shaped APIs (`find(options)`, `createQueryBuilder`) through a port.

Smells: ports with methods no use case calls; doubles full of `throw new Error('not used')`.

## D — Dependency Inversion

High-level policy (use cases) depends on abstractions it owns; details depend on those abstractions.

- Ports are declared in the **core** (`domain/repositories`, `application/ports`) and implemented in `infra`. The core never imports infra.
- Constructors receive ports; nothing in the core calls `new` on an adapter, reads `process.env`, or calls `Date.now()` / `randomUUID()` where tests need control (inject a `Clock`/`IdGenerator` port when time/ids matter to a rule).
- The binding happens only in the composition root: `{ provide: Port, useClass: Adapter }`.
- Abstract classes are used as ports because they work as Nest DI tokens at runtime while keeping the core free of `@Inject('TOKEN')` strings and `@nestjs/common` imports.

Smells: `@InjectRepository` outside infra; `import { ... } from '../infra/...'` in a use case; `new BcryptHasher()` inside a use case; `ConfigService` injected into the domain.

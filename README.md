# LeanStock Backend

Production-style 20% milestone for LeanStock: Express.js, Prisma 5, PostgreSQL 15, Redis, JWT auth, RBAC, tenant isolation, inventory transfer transactions, and dead-stock price decay.

## Quick Start

1. Copy environment template:

```bash
cp .env.example .env
```

2. Start the full stack:

```bash
docker compose up --build
```

3. Open Swagger UI:

```text
http://localhost:3000/docs
```

Health check:

```text
GET http://localhost:3000/health
```

## Implemented Scope

- Auth: register, login, refresh, logout, `/auth/me`.
- Security: bcrypt password hashing, JWT access tokens, persisted refresh tokens with revocation, RBAC middleware, Redis-backed auth rate limiting.
- LeanStock core: tenant-scoped locations, products, stock adjustment, atomic transfer, dead-stock decay job.
- Multi-tenancy: business tables include `tenantId`; every product/location/inventory query filters by authenticated user tenant.
- API docs: OpenAPI 3 contract served at `/docs`.
- Tests: unit tests for decay math, auth integration tests, inventory transaction integration test.

## Architecture Decisions

Express.js was chosen because the Week 1 backend track is Node.js, and Prisma 5 gives a type-safe ORM over PostgreSQL without raw SQL in application code. PostgreSQL is required for ACID inventory updates. Redis is used for two visible production concerns: auth rate limiting and transfer locks.

The inventory transfer endpoint does not use raw `SELECT FOR UPDATE` because the assignment bans raw SQL queries. Instead, it uses:

- Redis lock keys per `tenantId + productId + locationId` to serialize competing transfers.
- Prisma `$transaction` with `Serializable` isolation.
- Atomic `updateMany` conditional decrement: source stock is decremented only when `quantity >= requestedQuantity`.

That combination prevents overselling while staying inside Prisma ORM.

## Local Commands

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
npm test
npm run lint
```

For local tests, PostgreSQL must be available at `DATABASE_URL`. Docker Compose provides the expected Postgres and Redis services.

## Defense Flow

Recommended Postman tabs:

1. `POST /auth/register`
2. `POST /auth/login`
3. `GET /auth/me`
4. `POST /auth/refresh`
5. `POST /auth/logout`
6. `POST /locations`
7. `POST /products`
8. `GET /products`
9. `POST /inventory/stock`
10. `POST /inventory/transfers`
11. `POST /jobs/dead-stock-decay`

## Environment

The app validates required variables on boot using Zod. Missing `DATABASE_URL`, `REDIS_URL`, JWT secrets, or CORS origins stops startup. Production CORS rejects wildcard origins.

## CI/CD

`.github/workflows/ci.yml` starts PostgreSQL and Redis, installs dependencies, generates Prisma Client, applies migrations, runs lint/tests, and builds the Docker image.

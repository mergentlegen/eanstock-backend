# Changelog

## 0.1.0

- Implemented Express.js + Prisma 5 milestone for LeanStock.
- Added full auth baseline: registration, login, logout, refresh tokens, bcrypt, JWT, RBAC.
- Added Redis auth rate limiting and Redis transfer locking.
- Added tenant-scoped catalog, stock adjustment, atomic inventory transfer, and dead-stock decay.
- OpenAPI contract matches implemented endpoints. No intentional deviations from the blueprint; raw SQL was avoided in application code to satisfy the ORM constraint.

# Server integration tests

Run from the repo root:

```
npm test
```

Uses Node's built-in test runner (`node --test`) — no test framework dependency.

## One-time setup

The tests run against a dedicated **`rmc_test`** Postgres database (never `rmc_dev`,
never production). `test/helpers.js` points `DATABASE_URL` at
`postgresql://rmc:rmcdevpass123@localhost:5432/rmc_test` unless `TEST_DATABASE_URL`
is set.

Create and migrate it once (and again whenever `prisma/schema.prisma` changes):

```powershell
$env:DATABASE_URL = "postgresql://rmc:rmcdevpass123@localhost:5432/rmc_test"
npx prisma migrate deploy
Remove-Item Env:\DATABASE_URL
```

Prisma auto-creates the database if the `rmc` role has `CREATEDB`.

## What's covered

`authz.test.js` — the per-project access-control boundary: instance-ADMIN bypass,
membership as the gate (not `instanceRole`), project-list filtering, and role
enforcement on scoped routes. Each test truncates every table first, so tests are
order-independent.

# ADR 0003: PGlite for unit and integration tests, Compose Postgres for e2e

Date: 2026-09-03
Status: accepted

## Context

Most of what M1 delivers is database-shaped: migrations, a seed, guards that read session rows, a claim endpoint that writes a session and an audit row in one transaction. Testing that against mocks would test the mocks.

Two constraints pulled against each other. Tests must be fast and deterministic enough to run on every change, and the development host had no Docker installed when the milestone started (it still does not). A test suite that needs a container is a test suite that does not get run.

## Decision

**Unit and integration tests run on PGlite.** `packages/db/src/testing.ts` exports `createTestDb()`, which starts an in-memory PGlite instance, applies the committed migrations from `packages/db/migrations` with the Drizzle PGlite migrator, and hands back `{ db, close }`. One instance per test file. `apps/api` builds a real Fastify app over it via `buildApp({ db, config })` and drives it with `app.inject()` — real routing, real plugins, real SQL, no network and no container.

**Compose Postgres backs e2e.** `docker compose up` runs postgres 17, the API and the web app; the Playwright smoke test signs in as kitchen staff through the Next.js rewrite. CI runs that as a separate `compose-e2e` job.

**Verification (2026-09-02, scratch project).** The risk was better-auth on an embedded engine, so it was proven before the plan was written: better-auth 1.7.2 with `@better-auth/drizzle-adapter` over PGlite 0.5.8 handles sign-up, sign-in (200), wrong password (401), `getSession` including the custom `role` field, sign-out, and `disableSignUp` (400). Seeding staff directly — a `users` row plus an `accounts` row with `providerId: 'credential'`, `issuer: 'local:credential'`, `accountId` equal to the user id and `password` from `hashPassword()` in `better-auth/crypto` — produces accounts that sign in normally, which is how `packages/db/src/seed/run.ts` creates the three demo accounts.

**Caveat worth writing down.** The better-auth schema must be generated with `npx auth@latest generate`. The deprecated `@better-auth/cli` omits the `issuer` column on `accounts`, and better-auth 1.7.2 refuses to start against a schema without it. The failure is at boot, not at sign-in, so it is quick to hit and confusing to diagnose if you do not know the cause.

## Consequences

- `pnpm test` runs anywhere Node runs — a fresh clone, a laptop with no Docker, a CI runner with no services block.
- Tests exercise the same migrations that production applies, so a migration that does not apply cleanly fails the suite rather than a deploy.
- PGlite is Postgres, but it is a single-connection embedded build. Anything that depends on server-only behaviour — concurrent connections, `LISTEN`/`NOTIFY`, extensions PGlite does not bundle — needs a Compose-backed test instead. Nothing in M1 does; M3's real-time work is the first plausible candidate.
- The e2e path is the only part of the stack that cannot be verified on this host. As of this milestone it has been exercised in CI only.

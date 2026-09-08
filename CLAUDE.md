# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A collaborative music file sharing and project tracking platform (bands/collaborators sharing takes, mixes, and feedback). npm workspaces monorepo: `packages/server` (Express + Prisma/Postgres) and `packages/client` (React + Vite). No tests currently exist (`npm test` at the root is a stub).

## Commands

Run from the repo root — npm workspaces requires installing/resolving from root, not from inside a package.

```bash
npm install                 # installs all workspaces from root
npm run dev:server          # Express API with --watch, http://localhost:3001
npm run dev:client          # Vite dev server, http://localhost:5173 (proxies /api -> :3001)
npm run start:server        # production start (no watch)
npm run migrate             # npx prisma migrate dev (dev migrations)
npm run studio              # npx prisma studio
```

There is no lint or test command configured yet. Prisma client regenerates automatically via `prisma migrate dev`; use `npx prisma generate` directly if you only changed `prisma/schema.prisma` without wanting a migration.

## Architecture

### Monorepo layout
- `prisma/schema.prisma` — single source of truth for the data model, shared by both packages (only the server actually imports `@prisma/client`).
- `packages/server/src/routes/*.js` — one Express router per resource, all mounted under `/api` in `index.js`.
- `packages/server/src/lib/` — pure logic with no Express dependency (`roles.js`, `filenameParser.js`).
- `packages/server/src/middleware/` — `requireAuth` (session -> `req.user`) and `requireRole` (role check).
- `packages/client/src/pages/` — top-level routed views; `packages/client/src/components/` — everything else; `packages/client/src/api.js` — the only place `fetch` is called from the client.

### Domain model (see `prisma/schema.prisma` for the authoritative, heavily-commented version)
`Project -> Song -> Track -> Take`, plus `Mix` (a stereo bounce of a `Song`, with a frozen `MixComponent` manifest of exactly which `Take` per `Track` went into it). `Track.currentTakeId` and `Song.currentMixId` are nullable self-referential FKs used only to break an insert cycle — the app always keeps them set in practice; a new `Track`/first `Take` is created in one transaction. `Song.status` moves `DRAFT -> FROZEN -> PENDING_REAPPROVAL` via `UnfreezeRequest`.

Several entities (`Annotation`, `Approval`, `Todo`) attach to more than one possible parent type via multiple nullable FKs, with "exactly one parent" enforced in application code, not the database (Postgres/MySQL can't portably express that as a single constraint). `AuditLog` instead uses a polymorphic `(entityType, entityId)` pair with no DB-enforced referential integrity, by design, so new event kinds never require a migration.

The schema is pinned to Prisma 6 deliberately (not 7) — see the comment at the top of `schema.prisma`. A MySQL variant of the same schema exists for Dreamhost testing (same models, `provider = "mysql"`).

### Authorization: per-project membership, then role
`getEffectiveRole(userId, { projectId, songId })` in `lib/roles.js` resolves a `Role` (`ADMIN`/`CONTRIBUTOR`/`REVIEWER`/`VIEWER`) or **`null`** (no access). Rules, in order:
1. Instance `ADMIN` (`User.instanceRole === 'ADMIN'`) → `ADMIN` for every scope, unconditionally. This is the instance operator; it needs no membership. It's the only `instanceRole` value that grants anything on its own.
2. `SongRoleOverride` for this song → its role.
3. `Membership` for this project (song's project is resolved if only `songId` was passed) → its role.
4. Otherwise → `null`.

So a non-admin user sees/touches a project **only** via a `Membership` (or per-song `SongRoleOverride`). One instance can therefore host unrelated bands. A plain non-ADMIN `instanceRole` is just the default role a project invite assigns on redeem; it is not itself access. `MEMBER_ROLES` (all four) is exported from `lib/roles.js` for "any member" checks.

Route protection is `requireAuth` then `requireRole(allowedRoles, extractScope, opts?)`. `extractScope(req)` returns `{ projectId }` or `{ songId }`; shared resolvers that walk a child entity (take/track/mix/todo) up to its project live in `lib/scope.js`. `opts.notFoundOnNoAccess: true` on read routes makes a total non-member get **404** (can't probe another band's ids) while a member whose role is merely too low still gets 403. `GET /projects` is filtered to the caller's memberships (all non-hidden for an instance admin); `GET /projects/:id` returns the caller's `myRole` so the client can hide affordances. Project membership is managed via `routes/members.js` (`/projects/:id/members`), instance-ADMIN only, as is creating a project and creating an invite. `requireAuth` reads the session cookie, loads the `Session` + `User` from the DB (revocable rows, not a JWT), and sets `req.user`; routes read `req.user.id`, never a client-supplied id.

Integration tests for all of this: `packages/server/test/*.test.js`, run with `npm test` against a dedicated `rmc_test` DB (see `packages/server/test/README.md`). `scripts/backfill-memberships.js` is the one-off helper for granting existing users memberships on an existing deployment.

### Storage adapters
`packages/server/src/storage.js` is the only module that touches `fs` or the S3 client directly — every route that reads/writes a file goes through `writeFile` / `getReadStream` / `getRedirectUrl` here, which is what makes an adapter swap (e.g. adding Google Drive) a one-file change. Adapter selection is `STORAGE_ADAPTER` env var (`LOCAL` default, or `S3` — also covers R2/B2/MinIO, which speak the same API). `StorageConfig` rows hold non-secret config (bucket, region, endpoint); actual credentials are always environment variables, never the `settings` JSON column. `LOCAL` storage writes under `packages/server/local-storage/` and self-creates its default config with no setup needed.

### Auth & sessions
Cookie-based sessions (`SESSION_COOKIE_NAME` = `session_id`, see `constants.js`), not stateless JWT. Cookie options differ by environment: production needs `secure` + `sameSite: 'none'` for a genuinely cross-origin deployed frontend/backend; local dev needs `sameSite: 'lax'` and no `secure` (plain HTTP). `CLIENT_ORIGIN` must be set explicitly (not `*`) for CORS, since cookie-based auth requires `credentials: true`.

### Batch upload flow (Logic Pro-style filenames)
`lib/filenameParser.js` parses export filenames like `KickDrum-NewJerrySong-01-001.wav` into a candidate track name by stripping the trailing numeric Track Number/Increment segments, then empirically detecting and stripping a shared project-name segment across the whole batch (never guessed from one filename alone). The client flow is preview-then-commit: `POST /songs/:id/batch-preview` (filenames only, nothing saved) lets the user correct any ambiguous parse, then `POST /songs/:id/batch-upload` commits using the corrected `items` array. Files in a batch are processed and reported individually — one bad file doesn't fail the rest.

### Frozen song handling
Uploading to a `FROZEN` song doesn't block the upload — it auto-creates an `UnfreezeRequest` (unless one is already open) and lets the upload proceed. This same pattern repeats in `routes/tracks.js`, `routes/songs.js` (batch upload), etc.; keep it consistent if adding new upload paths.

### Take/Mix "current" promotion rule
A brand-new `Track`'s first `Take` always becomes `currentTakeId`, regardless of role (nothing existing is being overridden). Promoting a take on an *existing* track to become the new default is role-gated (`ADMIN` only in some flows) — check the specific route before assuming promotion behavior is uniform.

### Client
React Router with a single `App.jsx` gate: on load it calls `getMe()` to check the session cookie, then routes to `/login`, `/invite/:token`, `/setup` (first-admin bootstrap), or the authenticated app. `api.js` centralizes all requests; `VITE_API_BASE_URL` is baked in at Vite build time (not read at runtime), so it must be set before running `npm run build --workspace packages/client` for a real deployment. Non-JSON requests (file upload, streaming URLs, ZIP downloads) intentionally bypass the shared `request()` helper in `api.js` — see the comments there before changing its shape.

## Deployment (Render)

Full walkthrough in `SETUP.md` (local Postgres + Prisma setup) and `DEPLOY.md` (Render backend Web Service + frontend Static Site). Key points: build command runs `prisma migrate deploy` (not `migrate dev`) on every deploy; root directory is left blank on both Render services so npm workspaces resolves from the monorepo root; `git push` to `main` auto-redeploys both services.

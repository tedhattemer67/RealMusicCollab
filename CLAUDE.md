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

### Authorization: three-tier role cascade
`getEffectiveRole(userId, { projectId, songId })` in `lib/roles.js` resolves a `Role` (`ADMIN`/`CONTRIBUTOR`/`REVIEWER`/`VIEWER`) by checking, narrowest wins: `SongRoleOverride` (this song only) > `Membership` (this project only) > `User.instanceRole` (everywhere). Most users only ever carry an `instanceRole`; the other two tables exist only for the rare case where someone's access differs from their default. There is no separate "Owner" tier — any `ADMIN` can manage accounts and settings instance-wide.

Route protection is always `requireAuth` then `requireRole(allowedRoles, extractScope)`, where `extractScope(req)` pulls whatever `projectId`/`songId` is relevant out of `req.params`/`req.body` for that specific route (see `routes/songs.js` for examples). `requireAuth` reads the session cookie, loads the `Session` + `User` from the DB (not a JWT — sessions are revocable rows, so deactivating a user cuts off access immediately), and sets `req.user`. Routes must read `req.user.id`, never trust a client-supplied user id.

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

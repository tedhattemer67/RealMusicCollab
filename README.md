README

RealMusicCollab is a collaborative music file-sharing and project-tracking platform for bands and small groups of collaborators. It's organized as Project → Song → Track → Take, plus Mix (a stereo bounce of a  song built from a specific set of takes) — so a band can record multiple takes of a guitar part, mark one as current, get feedback and approvals from bandmates, freeze a song once it's locked in, and export  a working pull or a clean handoff package (individual stems or a full mixdown) as a ZIP. Access is per-project membership with four roles (Admin/Contributor/Reviewer/Viewer), so one hosted instance can privately serve multiple unrelated bands without them seeing each other's material. It's a self-hostable npm-workspaces monorepo — Express/Postgres/Prisma on the backend, React/Vite on the frontend — designed to run cheaply on something like Render, with local or S3-compatible storage for the actual audio files.

## Notification channels

Project activity (uploads, mixes, approvals, freezes, downloads, to-dos)
can post to a Slack channel, a Discord channel, or a generic webhook —
configured per project from the app itself: Admin → open a project →
**Notifications** in the sidebar. See `DEPLOY.md` for setup details.

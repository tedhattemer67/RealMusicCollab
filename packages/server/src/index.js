// npm workspace scripts run with the working directory set to
// packages/server, not the repo root — so dotenv's default "look in the
// current directory" behavior would miss the real .env file. Prisma has its
// own separate mechanism for finding it, but that doesn't extend to plain
// process.env reads anywhere else in this app, hence loading it explicitly
// here, first, before anything else.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const takesRouter = require('./routes/takes');
const invitesRouter = require('./routes/invites');
const authRouter = require('./routes/auth');
const approvalsRouter = require('./routes/approvals');
const songsRouter = require('./routes/songs');
const annotationsRouter = require('./routes/annotations');
const todosRouter = require('./routes/todos');
const mixesRouter = require('./routes/mixes');
const exportsRouter = require('./routes/exports');
const projectsRouter = require('./routes/projects');
const streamRouter = require('./routes/stream');
const tracksRouter = require('./routes/tracks');
const usersRouter = require('./routes/users');
const bootstrapRouter = require('./routes/bootstrap');

const app = express();

// CLIENT_ORIGIN needs to be set explicitly (not "*") because we're using
// cookie-based sessions — browsers refuse a wildcard origin combined with
// credentials. Defaults to Vite's default dev server port for local dev;
// set the real env var once the frontend has a real deployed URL.
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
    // Without this, a genuinely cross-origin frontend (once deployed
    // separately from the API) can't read the server's suggested filename
    // for downloads — it works fine right now only because Vite's dev
    // proxy makes this look same-origin to the browser.
    exposedHeaders: ['Content-Disposition'],
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', takesRouter);
app.use('/api', invitesRouter);
app.use('/api', authRouter);
app.use('/api', approvalsRouter);
app.use('/api', songsRouter);
app.use('/api', annotationsRouter);
app.use('/api', todosRouter);
app.use('/api', mixesRouter);
app.use('/api', exportsRouter);
app.use('/api', projectsRouter);
app.use('/api', streamRouter);
app.use('/api', tracksRouter);
app.use('/api', usersRouter);
app.use('/api', bootstrapRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

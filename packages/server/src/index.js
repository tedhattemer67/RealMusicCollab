const express = require('express');
const cookieParser = require('cookie-parser');
const takesRouter = require('./routes/takes');
const invitesRouter = require('./routes/invites');
const authRouter = require('./routes/auth');
const approvalsRouter = require('./routes/approvals');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', takesRouter);
app.use('/api', invitesRouter);
app.use('/api', authRouter);
app.use('/api', approvalsRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

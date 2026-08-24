const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const { recordEvent } = require('../lib/events');

const router = express.Router();

// A Todo is scoped to exactly one of Project/Song/Track — same pattern as
// createTodo's parentField/parentId args. Only Project and Song carry a
// projectId directly; a Track needs one more hop through its Song.
async function resolveProjectIdForTodo({ projectId, songId, trackId }) {
  if (projectId) return projectId;
  if (songId) {
    const song = await prisma.song.findUnique({ where: { id: songId }, select: { projectId: true } });
    return song ? song.projectId : undefined;
  }
  if (trackId) {
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { song: { select: { projectId: true } } },
    });
    return track ? track.song.projectId : undefined;
  }
  return undefined;
}

async function createTodo(req, res, parentField, parentId, parentModel) {
  try {
    const parent = await parentModel.findUnique({ where: { id: parentId } });
    if (!parent) {
      return res
        .status(404)
        .json({ error: `No ${parentField.replace('Id', '')} found with id ${parentId}.` });
    }

    const { body, deadline, assigneeIds } = req.body;
    if (!body) {
      return res.status(400).json({ error: 'body is required.' });
    }

    const todo = await prisma.todo.create({
      data: {
        body,
        [parentField]: parentId,
        deadline: deadline ? new Date(deadline) : null,
        createdById: req.user.id,
        assignees:
          assigneeIds && assigneeIds.length
            ? { connect: assigneeIds.map((id) => ({ id })) }
            : undefined,
      },
      include: { assignees: { select: { id: true, name: true } } },
    });

    const projectId = await resolveProjectIdForTodo({ [parentField]: parentId });
    const parentLabel = parentField === 'songId' ? parent.title : parent.name;

    await recordEvent({
      action: 'TODO_CREATED',
      actorId: req.user.id,
      entityType: 'Todo',
      entityId: todo.id,
      projectId,
      message: `${req.user.name} added a to-do on "${parentLabel}": ${body}`,
    });

    res.status(201).json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the to-do.' });
  }
}

async function listTodos(req, res, parentField, parentId) {
  try {
    const todos = await prisma.todo.findMany({
      where: { [parentField]: parentId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignees: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true } },
      },
    });
    res.json(todos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching to-dos.' });
  }
}

// Projects
router.post('/projects/:projectId/todos', requireAuth, (req, res) =>
  createTodo(req, res, 'projectId', req.params.projectId, prisma.project)
);
router.get('/projects/:projectId/todos', requireAuth, (req, res) =>
  listTodos(req, res, 'projectId', req.params.projectId)
);

// Songs
router.post('/songs/:songId/todos', requireAuth, (req, res) =>
  createTodo(req, res, 'songId', req.params.songId, prisma.song)
);
router.get('/songs/:songId/todos', requireAuth, (req, res) =>
  listTodos(req, res, 'songId', req.params.songId)
);

// Tracks
router.post('/tracks/:trackId/todos', requireAuth, (req, res) =>
  createTodo(req, res, 'trackId', req.params.trackId, prisma.track)
);
router.get('/tracks/:trackId/todos', requireAuth, (req, res) =>
  listTodos(req, res, 'trackId', req.params.trackId)
);

// PATCH /api/todos/:todoId  body: { completed: true|false }
// Matches the "instant save checkbox" behavior from the UI mockups — no
// separate batch-submit step.
router.patch('/todos/:todoId', requireAuth, async (req, res) => {
  try {
    const { todoId } = req.params;
    const { completed } = req.body;
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed (true or false) is required.' });
    }

    const todo = await prisma.todo.findUnique({ where: { id: todoId } });
    if (!todo) {
      return res.status(404).json({ error: `No to-do found with id ${todoId}.` });
    }

    const updated = await prisma.todo.update({
      where: { id: todoId },
      data: {
        completed,
        completedAt: completed ? new Date() : null,
        completedById: completed ? req.user.id : null,
      },
    });

    if (completed) {
      const projectId = await resolveProjectIdForTodo({
        projectId: todo.projectId,
        songId: todo.songId,
        trackId: todo.trackId,
      });

      await recordEvent({
        action: 'TODO_COMPLETED',
        actorId: req.user.id,
        entityType: 'Todo',
        entityId: todoId,
        projectId,
        message: `${req.user.name} completed a to-do: ${todo.body}`,
      });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the to-do.' });
  }
});

module.exports = router;

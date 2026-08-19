import { useState, useEffect, useCallback } from 'react';
import { getTodos, createTodo, updateTodoCompletion, getUsers } from '../api';

export default function TodosPanel({ parentType, parentId, label = 'To-dos', embedded = false }) {
  const [open, setOpen] = useState(embedded);
  const [todos, setTodos] = useState(null);
  const [users, setUsers] = useState([]);
  const [body, setBody] = useState('');
  const [deadline, setDeadline] = useState('');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getTodos(parentType, parentId)
      .then(setTodos)
      .catch((err) => setError(err.message));
  }, [parentType, parentId]);

  useEffect(() => {
    if (embedded) setOpen(true);
  }, [embedded]);

  useEffect(() => {
    if (open) {
      load();
      getUsers()
        .then(setUsers)
        .catch(() => {});
    }
  }, [open, load]);

  function toggleAssignee(id) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = { body };
      if (deadline) data.deadline = deadline;
      if (assigneeIds.length) data.assigneeIds = assigneeIds;
      await createTodo(parentType, parentId, data);
      setBody('');
      setDeadline('');
      setAssigneeIds([]);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Instant-save, no separate confirm step — matches the original mockup
  // design for to-do completion.
  async function handleToggle(todo) {
    try {
      await updateTodoCompletion(todo.id, !todo.completed);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className={embedded ? '' : 'card blueprint'} style={embedded ? undefined : { position: 'relative', marginTop: 8, maxWidth: 420 }}>
      {!embedded && (
        <>
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">{label}</span>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </>
      )}
      {!todos && <p className="text-muted" style={{ fontSize: 13 }}>Loading…</p>}
      {todos && todos.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No to-dos yet.</p>}
      {todos && todos.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {todos.map((t) => (
            <li
              key={t.id}
              className={embedded ? 'card' : undefined}
              style={{
                fontSize: 13,
                textDecoration: t.completed ? 'line-through' : 'none',
                opacity: t.completed ? 0.6 : 1,
                padding: embedded ? undefined : 0,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <input type="checkbox" checked={t.completed} onChange={() => handleToggle(t)} />
                <span>
                  {t.body}
                  {t.assignees && t.assignees.length > 0 && (
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {' '}
                      — {t.assignees.map((a) => a.name).join(', ')}
                    </span>
                  )}
                  {t.deadline && (
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {' '}
                      (due {new Date(t.deadline).toLocaleDateString()})
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          className="input"
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="New to-do…"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label className="text-muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            Due:
            <input
              className="input"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={{ minHeight: 28, fontSize: 12 }}
            />
          </label>
        </div>
        <div className="text-muted" style={{ fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          Assign:
          {users.map((u) => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={assigneeIds.includes(u.id)}
                onChange={() => toggleAssignee(u.id)}
              />
              {u.name}
            </label>
          ))}
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add to-do'}
        </button>
      </form>
      {error && <p style={{ color: 'crimson', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}

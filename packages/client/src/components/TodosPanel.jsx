import { useState, useEffect, useCallback } from 'react';
import { getTodos, createTodo, updateTodoCompletion, getUsers } from '../api';

export default function TodosPanel({ parentType, parentId, label = 'To-dos' }) {
  const [open, setOpen] = useState(false);
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
      <button onClick={() => setOpen(true)} style={{ marginLeft: 6, fontSize: 12 }}>
        {label}
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 6,
        fontSize: 13,
        border: '1px solid #ddd',
        padding: 8,
        borderRadius: 6,
        maxWidth: 420,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>{label}</strong>
        <button onClick={() => setOpen(false)} style={{ fontSize: 12 }}>
          Close
        </button>
      </div>
      {!todos && <p>Loading…</p>}
      {todos && todos.length === 0 && <p style={{ color: '#777' }}>No to-dos yet.</p>}
      {todos && todos.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: 8 }}>
          {todos.map((t) => (
            <li
              key={t.id}
              style={{
                marginBottom: 4,
                textDecoration: t.completed ? 'line-through' : 'none',
                color: t.completed ? '#888' : 'inherit',
              }}
            >
              <label>
                <input
                  type="checkbox"
                  checked={t.completed}
                  onChange={() => handleToggle(t)}
                  style={{ marginRight: 4 }}
                />
                {t.body}
                {t.assignees && t.assignees.length > 0 && (
                  <span style={{ color: '#777', fontSize: 12 }}>
                    {' '}
                    — {t.assignees.map((a) => a.name).join(', ')}
                  </span>
                )}
                {t.deadline && (
                  <span style={{ color: '#854f0b', fontSize: 12 }}>
                    {' '}
                    (due {new Date(t.deadline).toLocaleDateString()})
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="New to-do…"
          style={{ width: '100%', padding: 4, marginBottom: 4, boxSizing: 'border-box' }}
        />
        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 12, marginRight: 8 }}>
            Due:{' '}
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={{ fontSize: 12 }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 6, fontSize: 12 }}>
          Assign:{' '}
          {users.map((u) => (
            <label key={u.id} style={{ marginRight: 8 }}>
              <input
                type="checkbox"
                checked={assigneeIds.includes(u.id)}
                onChange={() => toggleAssignee(u.id)}
              />{' '}
              {u.name}
            </label>
          ))}
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add to-do'}
        </button>
      </form>
      {error && <p style={{ color: 'crimson', fontSize: 12 }}>{error}</p>}
    </div>
  );
}

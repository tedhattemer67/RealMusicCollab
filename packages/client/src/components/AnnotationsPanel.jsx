import { useState, useEffect, useCallback } from 'react';
import { getAnnotations, createAnnotation } from '../api';

// Genuinely open to every role, including Viewer — no gating here, since
// commenting is exactly what Viewer's role is meant to allow.
export default function AnnotationsPanel({ parentType, parentId }) {
  const [open, setOpen] = useState(false);
  const [annotations, setAnnotations] = useState(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getAnnotations(parentType, parentId)
      .then(setAnnotations)
      .catch((err) => setError(err.message));
  }, [parentType, parentId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createAnnotation(parentType, parentId, { body });
      setBody('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ marginLeft: 6, fontSize: 12 }}>
        Comments
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
        <strong>Comments</strong>
        <button onClick={() => setOpen(false)} style={{ fontSize: 12 }}>
          Close
        </button>
      </div>
      {!annotations && <p>Loading…</p>}
      {annotations && annotations.length === 0 && (
        <p style={{ color: '#777' }}>No comments yet.</p>
      )}
      {annotations && annotations.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, marginBottom: 8 }}>
          {annotations.map((a) => (
            <li key={a.id} style={{ marginBottom: 4 }}>
              <strong>{a.author?.name || 'Someone'}</strong>
              {a.timestampSeconds != null && ` @ ${a.timestampSeconds}s`}: {a.body}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          style={{ width: '70%', padding: 4 }}
        />
        <button type="submit" disabled={submitting} style={{ marginLeft: 4 }}>
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </form>
      {error && <p style={{ color: 'crimson', fontSize: 12 }}>{error}</p>}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { getAnnotations, createAnnotation } from '../api';

// Genuinely open to every role, including Viewer — no gating here, since
// commenting is exactly what Viewer's role is meant to allow.
export default function AnnotationsPanel({ parentType, parentId, label = 'Comments', embedded = false }) {
  const [open, setOpen] = useState(embedded);
  const [annotations, setAnnotations] = useState(null);
  const [body, setBody] = useState('');
  const [timestampSeconds, setTimestampSeconds] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getAnnotations(parentType, parentId)
      .then(setAnnotations)
      .catch((err) => setError(err.message));
  }, [parentType, parentId]);

  useEffect(() => {
    if (embedded) setOpen(true);
  }, [embedded]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = { body };
      if (parentType === 'take' && timestampSeconds !== '') {
        data.timestampSeconds = Number(timestampSeconds);
      }
      await createAnnotation(parentType, parentId, data);
      setBody('');
      setTimestampSeconds('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
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
      {!annotations && <p className="text-muted" style={{ fontSize: 13 }}>Loading…</p>}
      {annotations && annotations.length === 0 && (
        <p className="text-muted" style={{ fontSize: 13 }}>No comments yet.</p>
      )}
      {annotations && annotations.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {annotations.map((a) => (
            <li key={a.id} style={{ fontSize: 13 }}>
              <strong>{a.author?.name || 'Someone'}</strong>
              {a.timestampSeconds != null && (
                <span className="text-muted"> @ {a.timestampSeconds}s</span>
              )}
              : {a.body}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {parentType === 'take' && (
          <input
            className="input"
            type="number"
            step="0.1"
            min="0"
            placeholder="sec"
            value={timestampSeconds}
            onChange={(e) => setTimestampSeconds(e.target.value)}
            style={{ width: 60 }}
            title="Optional — a specific point in the audio this comment refers to"
          />
        )}
        <input
          className="input"
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          style={{ flex: 1, minWidth: 140 }}
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </form>
      {error && <p style={{ color: 'crimson', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}

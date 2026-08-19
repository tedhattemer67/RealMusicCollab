import { useState } from 'react';
import { createSong } from '../api';

export default function AddSongForm({ projectId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title) {
      setError('Song title is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createSong(projectId, { title });
      setTitle('');
      setOpen(false);
      if (onCreated) onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        + New song
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginTop: 12 }}>
      <input
        className="input"
        type="text"
        placeholder="Song title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p style={{ margin: 0, color: 'crimson', fontSize: 13 }}>{error}</p>}
    </form>
  );
}

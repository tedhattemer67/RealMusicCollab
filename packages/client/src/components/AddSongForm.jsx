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
      <button onClick={() => setOpen(true)} style={{ marginTop: 12, fontSize: 13 }}>
        + New song
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12, fontSize: 14 }}>
      <input
        type="text"
        placeholder="Song title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ padding: 4, marginRight: 6 }}
      />
      <button type="submit" disabled={submitting} style={{ padding: '4px 10px' }}>
        {submitting ? 'Creating…' : 'Create'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        style={{ marginLeft: 6, padding: '4px 10px' }}
      >
        Cancel
      </button>
      {error && <p style={{ color: 'crimson', fontSize: 13, margin: '4px 0' }}>{error}</p>}
    </form>
  );
}

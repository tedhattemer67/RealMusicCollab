import { useState } from 'react';
import { createProject } from '../api';

export default function AddProjectForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name) {
      setError('Project name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createProject({ name, caption: caption || undefined });
      setName('');
      setCaption('');
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
      <button onClick={() => setOpen(true)} style={{ marginTop: 8, fontSize: 13 }}>
        + New project
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 8, fontSize: 14 }}>
      <input
        type="text"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: 4, marginRight: 6 }}
      />
      <input
        type="text"
        placeholder="Caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
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

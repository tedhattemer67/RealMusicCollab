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
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        + New project
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginTop: 8 }}>
      <input
        className="input"
        type="text"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="input"
        type="text"
        placeholder="Caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
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

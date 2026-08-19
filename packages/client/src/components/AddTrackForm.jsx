import { useState, useRef } from 'react';
import { createTrack } from '../api';

export default function AddTrackForm({ songId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const fileInputRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!name) {
      setError('Track name is required.');
      return;
    }
    if (!file) {
      setError('Choose a file for the first take.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('file', file);
      await createTrack(songId, formData);
      setName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        + Add track
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginTop: 8 }}>
      <input
        className="input"
        type="text"
        placeholder="Track name (e.g. Drums)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input type="file" ref={fileInputRef} accept=".wav,audio/wav" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add track'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p style={{ margin: 0, color: 'crimson', fontSize: 13 }}>{error}</p>}
    </form>
  );
}

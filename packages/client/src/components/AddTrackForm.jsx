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
      <button onClick={() => setOpen(true)} style={{ marginTop: 6, fontSize: 13 }}>
        + Add track
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 8, fontSize: 14 }}>
      <input
        type="text"
        placeholder="Track name (e.g. Drums)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: 4, marginRight: 6 }}
      />
      <input type="file" ref={fileInputRef} accept=".wav,audio/wav" />
      <button type="submit" disabled={submitting} style={{ marginLeft: 6, padding: '4px 10px' }}>
        {submitting ? 'Adding…' : 'Add track'}
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

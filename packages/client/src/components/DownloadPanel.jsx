import { useState } from 'react';
import { exportSong } from '../api';

// Open to every role, including Viewer — matches how we designed export
// from the very start, back when this was just a mockup.
export default function DownloadPanel({ songId }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('working');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await exportSong(songId, mode);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ marginLeft: 6, fontSize: 12 }}>
        Download
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
        maxWidth: 320,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>Download</strong>
        <button onClick={() => setOpen(false)} style={{ fontSize: 12 }}>
          Close
        </button>
      </div>
      <div style={{ marginBottom: 6 }}>
        <label style={{ marginRight: 12 }}>
          <input
            type="radio"
            name={`export-mode-${songId}`}
            checked={mode === 'working'}
            onChange={() => setMode('working')}
          />{' '}
          Working pull
        </label>
        <label>
          <input
            type="radio"
            name={`export-mode-${songId}`}
            checked={mode === 'handoff'}
            onChange={() => setMode('handoff')}
          />{' '}
          External handoff
        </label>
      </div>
      <p style={{ fontSize: 11, color: '#777', margin: '0 0 8px' }}>
        {mode === 'working'
          ? 'Internal-style filenames, no info sheet — for pulling into your own DAW.'
          : 'Clean filenames plus an info sheet — for sharing with someone outside the platform.'}
      </p>
      <button onClick={handleDownload} disabled={downloading}>
        {downloading ? 'Preparing…' : 'Download ZIP'}
      </button>
      {error && <p style={{ color: 'crimson', fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

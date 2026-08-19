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
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        Export
      </button>
    );
  }

  return (
    <div className="card blueprint" style={{ position: 'relative', marginTop: 10, maxWidth: 340 }}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="card-title">Export</span>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="seg">
        <label className="seg-opt">
          <input
            type="radio"
            name={`export-mode-${songId}`}
            checked={mode === 'working'}
            onChange={() => setMode('working')}
          />
          Working pull
        </label>
        <label className="seg-opt">
          <input
            type="radio"
            name={`export-mode-${songId}`}
            checked={mode === 'handoff'}
            onChange={() => setMode('handoff')}
          />
          External handoff
        </label>
      </div>
      <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
        {mode === 'working'
          ? 'Internal-style filenames, no info sheet — for pulling into your own DAW.'
          : 'Clean filenames plus an info sheet — for sharing with someone outside the platform.'}
      </p>
      <button className="btn btn-primary" onClick={handleDownload} disabled={downloading}>
        {downloading ? 'Preparing…' : 'Download ZIP'}
      </button>
      {error && <p style={{ color: 'crimson', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}

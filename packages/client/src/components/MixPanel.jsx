import { useState, useEffect, useCallback, useRef } from 'react';
import { getMixes, createMix, finalizeMix, getMixStreamUrl } from '../api';
import MixApprovalControl from './MixApprovalControl.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';

export default function MixPanel({ songId, user, onChange, embedded = false }) {
  const [open, setOpen] = useState(embedded);
  const [mixes, setMixes] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [finalizing, setFinalizing] = useState(null);

  const load = useCallback(() => {
    getMixes(songId)
      .then(setMixes)
      .catch((err) => setError(err.message));
  }, [songId]);

  useEffect(() => {
    if (embedded) setOpen(true);
  }, [embedded]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const canCreate = user && (user.instanceRole === 'ADMIN' || user.instanceRole === 'CONTRIBUTOR');
  const isAdmin = user && user.instanceRole === 'ADMIN';

  // Highest mixNumber is the current/latest one — gets full controls
  // (approve, comments, finalize). Older versions below just show history
  // and playback, since approving/commenting on a superseded mix rarely matters.
  const latest = mixes && mixes.length > 0 ? mixes[mixes.length - 1] : null;
  const older = mixes && mixes.length > 1 ? mixes.slice(0, -1) : [];

  async function handleCreate(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await createMix(songId, formData);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
      if (onChange) onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleFinalize(mixId) {
    setFinalizing(mixId);
    setError(null);
    try {
      await finalizeMix(mixId);
      load();
      if (onChange) onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setFinalizing(null);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        Mixes
      </button>
    );
  }

  return (
    <div className={embedded ? '' : 'card blueprint'} style={embedded ? undefined : { position: 'relative', marginTop: 8, maxWidth: 460 }}>
      {!embedded && (
        <>
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">Mixes</span>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </>
      )}

      {!mixes && <p className="text-muted" style={{ fontSize: 13 }}>Loading…</p>}
      {mixes && mixes.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No mixes yet.</p>}

      {latest && (
        <div className="card blueprint" style={{ position: 'relative' }}>
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="card-title">
              v{latest.mixNumber} ({latest.status})
            </span>
            <span className="text-muted" style={{ fontSize: 12 }}>
              uploaded by {latest.uploadedBy?.name || 'someone'}
            </span>
            {latest.status === 'DRAFT' && isAdmin && (
              <button
                className="btn btn-secondary"
                onClick={() => handleFinalize(latest.id)}
                disabled={finalizing === latest.id}
              >
                {finalizing === latest.id ? 'Finalizing…' : 'Finalize'}
              </button>
            )}
          </div>
          <audio controls src={getMixStreamUrl(latest.id)} style={{ width: '100%' }} />
          <MixApprovalControl mix={latest} user={user} />
          <AnnotationsPanel parentType="mix" parentId={latest.id} label="Mix comments" />
        </div>
      )}

      {older.length > 0 && (
        <div>
          <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 4px' }}>Earlier versions:</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {older
              .slice()
              .reverse()
              .map((m) => (
                <li key={m.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  v{m.mixNumber} ({m.status})
                  <audio controls src={getMixStreamUrl(m.id)} style={{ height: 28, width: 180 }} />
                </li>
              ))}
          </ul>
        </div>
      )}

      {canCreate && (
        <form onSubmit={handleCreate} style={{ marginTop: 8 }}>
          <input type="file" ref={fileInputRef} accept=".wav,audio/wav" />
          <button type="submit" className="btn btn-primary" disabled={uploading} style={{ marginLeft: 6 }}>
            {uploading ? 'Uploading…' : 'Upload new mix'}
          </button>
          <p className="text-muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
            Uses each track's current default take automatically.
          </p>
        </form>
      )}
      {error && <p style={{ color: 'crimson', fontSize: 12 }}>{error}</p>}
    </div>
  );
}

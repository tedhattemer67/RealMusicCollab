import { useState, useEffect, useCallback, useRef } from 'react';
import { getMixes, createMix, finalizeMix } from '../api';
import MixApprovalControl from './MixApprovalControl.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';

export default function MixPanel({ songId, user, onChange }) {
  const [open, setOpen] = useState(false);
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
      <button onClick={() => setOpen(true)} style={{ marginLeft: 6, fontSize: 12 }}>
        Mixes
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
        maxWidth: 460,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>Mixes</strong>
        <button onClick={() => setOpen(false)} style={{ fontSize: 12 }}>
          Close
        </button>
      </div>

      {!mixes && <p>Loading…</p>}
      {mixes && mixes.length === 0 && <p style={{ color: '#777' }}>No mixes yet.</p>}

      {latest && (
        <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
          <div>
            <strong>
              v{latest.mixNumber} ({latest.status})
            </strong>{' '}
            — uploaded by {latest.uploadedBy?.name || 'someone'}
            {latest.status === 'DRAFT' && isAdmin && (
              <button
                onClick={() => handleFinalize(latest.id)}
                disabled={finalizing === latest.id}
                style={{ marginLeft: 6 }}
              >
                {finalizing === latest.id ? 'Finalizing…' : 'Finalize'}
              </button>
            )}
          </div>
          <audio
            controls
            src={`/api/mixes/${latest.id}/stream`}
            style={{ width: '100%', marginTop: 4 }}
          />
          <MixApprovalControl mix={latest} user={user} />
          <AnnotationsPanel parentType="mix" parentId={latest.id} label="Mix comments" />
        </div>
      )}

      {older.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: '#777', margin: '0 0 4px' }}>Earlier versions:</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {older
              .slice()
              .reverse()
              .map((m) => (
                <li key={m.id} style={{ marginBottom: 4, fontSize: 12 }}>
                  v{m.mixNumber} ({m.status}) —{' '}
                  <audio
                    controls
                    src={`/api/mixes/${m.id}/stream`}
                    style={{ verticalAlign: 'middle', height: 24, width: 160 }}
                  />
                </li>
              ))}
          </ul>
        </div>
      )}

      {canCreate && (
        <form onSubmit={handleCreate}>
          <input type="file" ref={fileInputRef} accept=".wav,audio/wav" />
          <button type="submit" disabled={uploading} style={{ marginLeft: 4 }}>
            {uploading ? 'Uploading…' : 'Upload new mix'}
          </button>
          <p style={{ fontSize: 11, color: '#777', margin: '4px 0 0' }}>
            Uses each track's current default take automatically.
          </p>
        </form>
      )}
      {error && <p style={{ color: 'crimson', fontSize: 12 }}>{error}</p>}
    </div>
  );
}

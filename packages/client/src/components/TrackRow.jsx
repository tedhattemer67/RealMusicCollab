import { useState, useRef, useEffect } from 'react';
import { getTrackTakes, uploadTake, getTakeApprovals, approveTake, getTakeStreamUrl } from '../api';
import Badge from './Badge.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';

export default function TrackRow({ track, onUploaded, user }) {
  const [expanded, setExpanded] = useState(false);
  const [takes, setTakes] = useState(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);

  // Derived, not stored: the current take's real Approval rows. Kept as the
  // full list (not just a badge boolean) so we can tell whether *this*
  // logged-in user specifically already approved, versus someone else having.
  const [approvals, setApprovals] = useState(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState(null);

  useEffect(() => {
    if (!track.currentTake) {
      setApprovals(null);
      return;
    }
    getTakeApprovals(track.currentTake.id)
      .then(setApprovals)
      .catch(() => setApprovals(null));
  }, [track.currentTake?.id]);

  const myApproval =
    approvals && user ? approvals.find((a) => a.userId === user.id) : null;

  async function handleApprove() {
    if (!track.currentTake) return;
    setApproving(true);
    setApproveError(null);
    try {
      await approveTake(track.currentTake.id);
      const fresh = await getTakeApprovals(track.currentTake.id);
      setApprovals(fresh);
    } catch (err) {
      setApproveError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function loadTakes() {
    setLoading(true);
    try {
      const data = await getTrackTakes(track.id);
      setTakes(data);
    } finally {
      setLoading(false);
    }
  }

  // Take history is only fetched the first time a track is expanded, not
  // up front for every track in the tree — matches the "collapsed by
  // default" behavior from the original mockups, and avoids loading data
  // nobody's asked to see yet.
  async function toggleExpand() {
    if (!expanded && takes === null) {
      await loadTakes();
    }
    setExpanded((e) => !e);
  }

  async function handleUpload(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError('Choose a file first.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (note) formData.append('note', note);
      const result = await uploadTake(track.id, formData);
      setUploadResult(result);
      setNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (expanded) await loadTakes();
      // Track's own state doesn't know its own currentTake/take count — the
      // parent (ProjectTree) owns that, so it needs to refetch the whole
      // project to keep the summary line accurate after an upload.
      if (onUploaded) onUploaded();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const [showPreviewPlayer, setShowPreviewPlayer] = useState(false);
  function handlePreview() {
    setShowPreviewPlayer((s) => !s);
  }

  return (
    <li className="trackrow" style={{ listStyle: 'none' }}>
      <div>
        <div className="card-title">{track.name}</div>
        <div className="wave" style={{ marginTop: 8 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="text-muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Current
        </span>
        <span style={{ fontSize: 13 }}>
          {track.currentTake ? `Take ${track.currentTake.takeNumber}` : 'No current take'}
          {' · '}
          {track._count.takes} take{track._count.takes === 1 ? '' : 's'}
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {approvals && approvals.length > 0 && <Badge variant="accent">approved</Badge>}
          {approvals && approvals.length === 0 && <Badge variant="outline">pending approval</Badge>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={toggleExpand}>
          {expanded ? 'Hide history' : 'History'}
        </button>
        <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
          + Take
        </button>
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className="btn btn-ghost"
          onClick={handlePreview}
          disabled={!track.currentTake}
          title="Isolated preview of this track's current take — no mix context"
        >
          {showPreviewPlayer ? 'Hide preview' : 'Preview'}
        </button>
        {track.currentTake &&
          user &&
          user.instanceRole !== 'VIEWER' &&
          (myApproval ? (
            <span className="text-muted" style={{ fontSize: 12 }}>✓ You approved this</span>
          ) : (
            <button className="btn btn-secondary" onClick={handleApprove} disabled={approving}>
              {approving ? 'Approving…' : 'Approve'}
            </button>
          ))}
        {track.currentTake && (
          <AnnotationsPanel parentType="take" parentId={track.currentTake.id} label="Take comments" />
        )}
      </div>

      {approveError && <p style={{ gridColumn: '1 / -1', color: 'crimson', fontSize: 13, margin: 0 }}>{approveError}</p>}

      {showPreviewPlayer && track.currentTake && (
        <audio
          controls
          src={getTakeStreamUrl(track.currentTake.id)}
          style={{ gridColumn: '1 / -1', width: '100%' }}
        />
      )}

      {expanded && (
        <ul style={{ gridColumn: '1 / -1', margin: 0, padding: 0, listStyle: 'none', fontSize: 13 }}>
          {loading && <li className="text-muted">Loading…</li>}
          {takes &&
            takes.map((t) => (
              <li key={t.id}>
                Take {t.takeNumber} — performed by {t.performedBy?.name || 'unknown'}
                {t.note ? ` — "${t.note}"` : ''}
              </li>
            ))}
        </ul>
      )}

      <form
        onSubmit={handleUpload}
        style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <input type="file" ref={fileInputRef} accept=".wav,audio/wav" />
        <input
          className="input"
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <button type="submit" className="btn btn-secondary" disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload take'}
        </button>
      </form>
      {uploadError && <p style={{ gridColumn: '1 / -1', color: 'crimson', fontSize: 13, margin: 0 }}>{uploadError}</p>}
      {uploadResult && (
        <p style={{ gridColumn: '1 / -1', color: 'var(--color-accent-700)', fontSize: 13, margin: 0 }}>
          Uploaded Take {uploadResult.takeNumber}
          {uploadResult.promotedToDefault ? ' — set as new default' : ' — awaiting promotion'}
          {uploadResult.unfreezeRequestCreated ? ' — song was frozen, unfreeze request created' : ''}
        </p>
      )}
    </li>
  );
}

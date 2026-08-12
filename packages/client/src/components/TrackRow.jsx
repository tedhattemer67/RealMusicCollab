import { useState, useRef, useEffect } from 'react';
import { getTrackTakes, uploadTake, getTakeApprovals, approveTake } from '../api';
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
    <li style={{ marginBottom: 12 }}>
      <div>
        <strong>{track.name}</strong>{' '}
        {track.currentTake ? `— current: Take ${track.currentTake.takeNumber}` : '— no current take'}{' '}
        (<em>
          {track._count.takes} take{track._count.takes === 1 ? '' : 's'}
        </em>)
        {approvals && approvals.length > 0 && <Badge color="green">approved</Badge>}
        {approvals && approvals.length === 0 && <Badge color="amber">pending approval</Badge>}
        <button onClick={toggleExpand} style={{ marginLeft: 8 }}>
          {expanded ? 'Hide takes' : 'Show takes'}
        </button>
        <button
          onClick={handlePreview}
          disabled={!track.currentTake}
          style={{ marginLeft: 6 }}
          title="Isolated preview of this track's current take — no mix context"
        >
          {showPreviewPlayer ? 'Hide preview' : 'Preview'}
        </button>
        {track.currentTake &&
          user &&
          user.instanceRole !== 'VIEWER' &&
          (myApproval ? (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#3b6d11' }}>✓ You approved this</span>
          ) : (
            <button onClick={handleApprove} disabled={approving} style={{ marginLeft: 6 }}>
              {approving ? 'Approving…' : 'Approve'}
            </button>
          ))}
      </div>

      {approveError && (
        <p style={{ color: 'crimson', fontSize: 13, margin: '4px 0' }}>{approveError}</p>
      )}

      <AnnotationsPanel parentType="track" parentId={track.id} />

      {showPreviewPlayer && track.currentTake && (
        <div style={{ marginTop: 6 }}>
          <audio controls src={`/api/takes/${track.currentTake.id}/stream`} style={{ width: '100%' }} />
        </div>
      )}

      {expanded && (
        <ul style={{ marginTop: 4 }}>
          {loading && <li>Loading…</li>}
          {takes &&
            takes.map((t) => (
              <li key={t.id}>
                Take {t.takeNumber} — performed by {t.performedBy?.name || 'unknown'}
                {t.note ? ` — "${t.note}"` : ''}
              </li>
            ))}
        </ul>
      )}

      <form onSubmit={handleUpload} style={{ marginTop: 6, fontSize: 14 }}>
        <input type="file" ref={fileInputRef} accept=".wav,audio/wav" />
        <input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ marginLeft: 6, padding: 4 }}
        />
        <button type="submit" disabled={uploading} style={{ marginLeft: 6, padding: '4px 10px' }}>
          {uploading ? 'Uploading…' : 'Upload take'}
        </button>
      </form>
      {uploadError && (
        <p style={{ color: 'crimson', fontSize: 13, margin: '4px 0' }}>{uploadError}</p>
      )}
      {uploadResult && (
        <p style={{ color: '#2a7', fontSize: 13, margin: '4px 0' }}>
          Uploaded Take {uploadResult.takeNumber}
          {uploadResult.promotedToDefault ? ' — set as new default' : ' — awaiting promotion'}
          {uploadResult.unfreezeRequestCreated
            ? ' — song was frozen, unfreeze request created'
            : ''}
        </p>
      )}
    </li>
  );
}

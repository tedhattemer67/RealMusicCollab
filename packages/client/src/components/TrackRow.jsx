import { useState, useRef, useEffect } from 'react';
import {
  getTrackTakes,
  uploadTake,
  getTakeApprovals,
  approveTake,
  getTakeStreamUrl,
  setCurrentTake,
} from '../api';
import Badge from './Badge.jsx';
import AnnotationsPanel from './AnnotationsPanel.jsx';

export default function TrackRow({ track, onUploaded, user, myRole }) {
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

  // The take currently loaded into the shared preview player (id string), or
  // null when nothing is playing. One player, not one per take, so switching
  // between takes is a single click and only one thing ever plays at once.
  const [previewTakeId, setPreviewTakeId] = useState(null);

  // Which take the "Make current" action is mid-flight for, so only that
  // row's button shows a spinner.
  const [promotingId, setPromotingId] = useState(null);
  const [promoteError, setPromoteError] = useState(null);

  function loadApprovals() {
    if (!track.currentTake) {
      setApprovals(null);
      return;
    }
    getTakeApprovals(track.currentTake.id)
      .then(setApprovals)
      .catch(() => setApprovals(null));
  }

  useEffect(() => {
    loadApprovals();
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
      if (expanded) await loadTakes();
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

  function togglePreview(takeId) {
    setPreviewTakeId((current) => (current === takeId ? null : takeId));
  }

  async function handleApproveTake(takeId) {
    setApproving(true);
    setApproveError(null);
    try {
      await approveTake(takeId);
      await loadTakes();
      if (takeId === track.currentTake?.id) loadApprovals();
    } catch (err) {
      setApproveError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleMakeCurrent(takeId) {
    setPromotingId(takeId);
    setPromoteError(null);
    try {
      const result = await setCurrentTake(track.id, takeId);
      if (result.unfreezeRequestCreated) {
        setPromoteError('Song was frozen — an unfreeze request was created.');
      }
      await loadTakes();
      // currentTake lives on the parent's project tree, so it has to refetch
      // for the "Current" line here (and the mix-building context) to update.
      if (onUploaded) onUploaded();
    } catch (err) {
      setPromoteError(err.message);
    } finally {
      setPromotingId(null);
    }
  }

  // Effective role for THIS project (from GET /projects/:id -> myRole), with a
  // fall back to the instance role for any caller rendered without it.
  const role = myRole || (user && user.instanceRole);
  const isAdmin = role === 'ADMIN';
  const canApprove = role && role !== 'VIEWER';
  const canUpload = role === 'ADMIN' || role === 'CONTRIBUTOR';

  // Take number shown next to the shared player. Comes from the loaded take
  // list when we have it, or the current-take summary otherwise.
  const previewingTake =
    previewTakeId &&
    ((takes && takes.find((t) => t.id === previewTakeId)) ||
      (track.currentTake?.id === previewTakeId ? track.currentTake : null));

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
          {expanded ? 'Hide takes' : 'Takes'}
        </button>
        {canUpload && (
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            + Take
          </button>
        )}
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className="btn btn-ghost"
          onClick={() => track.currentTake && togglePreview(track.currentTake.id)}
          disabled={!track.currentTake}
          title="Isolated preview of this track's current take — no mix context"
        >
          {previewTakeId && previewTakeId === track.currentTake?.id ? 'Hide preview' : 'Preview'}
        </button>
        {track.currentTake &&
          canApprove &&
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
      {promoteError && <p style={{ gridColumn: '1 / -1', color: 'crimson', fontSize: 13, margin: 0 }}>{promoteError}</p>}

      {previewTakeId && (
        <div style={{ gridColumn: '1 / -1' }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            Previewing {previewingTake ? `Take ${previewingTake.takeNumber}` : 'take'}
          </span>
          <audio
            key={previewTakeId}
            controls
            autoPlay
            src={getTakeStreamUrl(previewTakeId)}
            style={{ width: '100%', marginTop: 4 }}
          />
        </div>
      )}

      {expanded && (
        <div style={{ gridColumn: '1 / -1' }}>
          {loading && <p className="text-muted" style={{ fontSize: 13 }}>Loading…</p>}
          {takes && takes.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13 }}>No takes yet.</p>
          )}
          {takes && takes.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {takes.map((t) => {
                const isCurrent = t.id === track.currentTake?.id;
                const iApproved = user && t.approvals?.some((a) => a.userId === user.id);
                return (
                  <li
                    key={t.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      padding: '6px 0',
                      borderTop: '1px solid var(--color-border, #ddd)',
                    }}
                  >
                    <span style={{ fontWeight: 600, minWidth: 56 }}>Take {t.takeNumber}</span>
                    {isCurrent && <Badge variant="accent">current</Badge>}
                    {!t.readyForFeedback && <Badge variant="outline">draft</Badge>}
                    <span className="text-muted">
                      {t.performedBy?.name || 'unknown'}
                      {t.note ? ` — “${t.note}”` : ''}
                    </span>
                    {t.approvals?.length > 0 && (
                      <Badge variant="outline">
                        {t.approvals.length} approval{t.approvals.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                    <span style={{ flex: 1 }} />
                    <button className="btn btn-ghost" onClick={() => togglePreview(t.id)}>
                      {previewTakeId === t.id ? 'Hide' : 'Preview'}
                    </button>
                    {canApprove &&
                      (iApproved ? (
                        <span className="text-muted" style={{ fontSize: 12 }}>✓ approved</span>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleApproveTake(t.id)}
                          disabled={approving}
                        >
                          Approve
                        </button>
                      ))}
                    {isAdmin && !isCurrent && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleMakeCurrent(t.id)}
                        disabled={promotingId === t.id}
                      >
                        {promotingId === t.id ? 'Setting…' : 'Make current'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {canUpload && (
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
      )}
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

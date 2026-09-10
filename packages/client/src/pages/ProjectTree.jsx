import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getProject,
  freezeSong,
  getUnfreezeRequests,
  requestUnfreeze,
  resolveUnfreezeRequest,
  archiveProject,
  getMixStreamUrl,
} from '../api';
import TrackRow from '../components/TrackRow.jsx';
import Badge from '../components/Badge.jsx';
import AddTrackForm from '../components/AddTrackForm.jsx';
import AddSongForm from '../components/AddSongForm.jsx';
import BatchUploadForm from '../components/BatchUploadForm.jsx';
import AnnotationsPanel from '../components/AnnotationsPanel.jsx';
import TodosPanel from '../components/TodosPanel.jsx';
import MixPanel from '../components/MixPanel.jsx';
import DownloadPanel from '../components/DownloadPanel.jsx';
import MixApprovalControl from '../components/MixApprovalControl.jsx';
import NotificationChannelsPanel from '../components/NotificationChannelsPanel.jsx';
import ProjectMembersPanel from '../components/ProjectMembersPanel.jsx';
import './ProjectTree.css';

const DESKTOP_TABS = [
  { key: 'tracks', label: 'Tracks' },
  { key: 'mixes', label: 'Mixes' },
  { key: 'todos', label: 'To-dos' },
  { key: 'activity', label: 'Activity' },
];
const MOBILE_TABS = [
  { key: 'tracks', label: 'Tracks' },
  { key: 'mixes', label: 'Mixes' },
  { key: 'todos', label: 'To-dos' },
  { key: 'notes', label: 'Notes' },
];

function SongStatusBadge({ status }) {
  if (status === 'FROZEN') return <Badge variant="accent">frozen</Badge>;
  if (status === 'PENDING_REAPPROVAL') return <Badge variant="outline">pending re-approval</Badge>;
  return <Badge variant="neutral">draft</Badge>;
}

// Freeze/unfreeze — each song needs its own independent state, same
// reasoning as the mix-related components extracted into their own files.
function FreezeControl({ song, myRole, onChange }) {
  const [openRequest, setOpenRequest] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadRequests = useCallback(() => {
    getUnfreezeRequests(song.id)
      .then((requests) => {
        setOpenRequest(requests.find((r) => r.status === 'OPEN') || null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [song.id]);

  useEffect(() => {
    if (song.status === 'FROZEN') {
      loadRequests();
    } else {
      setOpenRequest(null);
      setLoaded(true);
    }
  }, [song.status, loadRequests]);

  // Matches the server's requireRole(['ADMIN'], { songId }) on freeze/resolve
  // (songs.js): effective role at this song's project scope, which a
  // project-level ADMIN Membership satisfies just as much as an instance
  // ADMIN (getEffectiveRole resolves both to 'ADMIN') — not instanceRole,
  // which would hide the button from a project admin who isn't also an
  // instance admin even though the API lets them freeze.
  const isAdmin = myRole === 'ADMIN';

  async function handleFreeze() {
    setBusy(true);
    setError(null);
    try {
      await freezeSong(song.id);
      if (onChange) onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // No role check here on purpose — the original design explicitly said
  // Contributors, Reviewers, *and* Viewers can all ask for a reopen. Only
  // freezing and resolving the request stay Admin-only.
  async function handleRequestUnfreeze() {
    setBusy(true);
    setError(null);
    try {
      await requestUnfreeze(song.id);
      loadRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResolve(approve) {
    setBusy(true);
    setError(null);
    try {
      await resolveUnfreezeRequest(song.id, openRequest.id, approve);
      if (onChange) onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {(song.status === 'DRAFT' || song.status === 'PENDING_REAPPROVAL') && isAdmin && (
        <button className="btn btn-primary blueprint" style={{ position: 'relative' }} onClick={handleFreeze} disabled={busy}>
          {busy ? 'Freezing…' : 'Freeze'}
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
        </button>
      )}
      {song.status === 'FROZEN' && loaded && !openRequest && (
        <button className="btn btn-secondary" onClick={handleRequestUnfreeze} disabled={busy}>
          {busy ? 'Requesting…' : 'Request unfreeze'}
        </button>
      )}
      {song.status === 'FROZEN' && openRequest && (
        <span className="text-muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Unfreeze requested by {openRequest.requestedBy?.name || 'someone'}
          {isAdmin && (
            <>
              <button className="btn btn-secondary" onClick={() => handleResolve(true)} disabled={busy}>
                Approve
              </button>
              <button className="btn btn-secondary" onClick={() => handleResolve(false)} disabled={busy}>
                Deny
              </button>
            </>
          )}
        </span>
      )}
      {error && <span style={{ color: 'crimson', fontSize: 12 }}>{error}</span>}
    </span>
  );
}

// Compact "current mix" summary shown under the Tracks tab — a Listen
// toggle plus the same approval control the full Mixes tab uses.
function MixApprovalSummary({ song, user }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const mix = song.currentMix;
  if (!mix) return null;

  return (
    <div style={{ marginTop: 22 }}>
      <h4 style={{ margin: '0 0 10px' }}>Mix approval</h4>
      <div className="card blueprint mix-approval-card" style={{ position: 'relative' }}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <div>
          <div className="card-title">Mix v{mix.mixNumber}</div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Printed from {song.tracks.length} current take{song.tracks.length === 1 ? '' : 's'} ·{' '}
            {mix.status === 'DRAFT' ? 'awaiting approval' : mix.status.toLowerCase()}
          </div>
          {showPlayer && (
            <audio controls src={getMixStreamUrl(mix.id)} style={{ width: '100%', marginTop: 8 }} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowPlayer((s) => !s)}>
            {showPlayer ? 'Hide' : 'Listen'}
          </button>
          <MixApprovalControl mix={mix} user={user} />
        </div>
      </div>
    </div>
  );
}

// Now driven by the URL (useParams) instead of always fetching the first
// project — that shortcut is gone now that there's a real picker to link from.
export default function ProjectTree({ user }) {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState(null);

  const [selectedSongId, setSelectedSongId] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [activeTab, setActiveTab] = useState('tracks');
  // Sidebar songs start collapsed — with a dozen-plus songs, rendering every
  // song's full track list at once made the tree unusable. The song you're
  // actively viewing is auto-expanded (see selectSong / the default-select
  // effect); the chevron toggles any song independently of selection.
  const [expandedSongIds, setExpandedSongIds] = useState(() => new Set());

  async function handleArchive() {
    setArchiving(true);
    setArchiveError(null);
    try {
      await archiveProject(projectId);
    } catch (err) {
      setArchiveError(err.message);
    } finally {
      setArchiving(false);
    }
  }

  const load = useCallback(() => {
    getProject(projectId)
      .then(setProject)
      .catch((err) => setError(err.message));
  }, [projectId]);

  useEffect(() => {
    setProject(null);
    setError(null);
    setSelectedSongId(null);
    setSelectedTrackId(null);
    load();
  }, [load]);

  // Keep the selected song valid as the project reloads (e.g. after a song
  // is added, or on first load) — defaults to the first song.
  useEffect(() => {
    if (!project) return;
    if (!project.songs.find((s) => s.id === selectedSongId)) {
      const nextId = project.songs[0]?.id ?? null;
      setSelectedSongId(nextId);
      setSelectedTrackId(null);
      if (nextId) expandSong(nextId);
    }
  }, [project, selectedSongId]);

  function expandSong(songId) {
    setExpandedSongIds((prev) => {
      if (prev.has(songId)) return prev;
      const next = new Set(prev);
      next.add(songId);
      return next;
    });
  }

  function toggleSongExpanded(songId) {
    setExpandedSongIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }

  function selectSong(songId) {
    setSelectedSongId(songId);
    setSelectedTrackId(null);
    setActiveTab('tracks');
    expandSong(songId);
  }

  function selectTrack(songId, trackId) {
    setSelectedSongId(songId);
    setSelectedTrackId(trackId);
    setActiveTab('tracks');
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: 'crimson' }}>
          This project isn’t available to you{error && error !== 'Not found.' ? ` — ${error}` : '.'}
        </p>
        <p><Link to="/">&larr; Back to your projects</Link></p>
      </div>
    );
  }
  if (!project) return <p className="text-muted">Loading…</p>;

  // The caller's effective role for this project (GET /projects/:id -> myRole).
  const canUpload = project.myRole === 'ADMIN' || project.myRole === 'CONTRIBUTOR';

  const selectedSong = project.songs.find((s) => s.id === selectedSongId) || null;

  return (
    <div className="workspace-grid">
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="mono text-muted">Project</span>
          <span className="sidebar-project-name">{project.name}</span>
          <p style={{ margin: '4px 0 0' }}>
            <Link to="/" style={{ fontSize: 12 }}>&larr; All projects</Link>
          </p>
          {user && user.instanceRole === 'ADMIN' && (
            <button
              className="btn btn-ghost"
              style={{ alignSelf: 'flex-start', paddingInline: 0 }}
              onClick={handleArchive}
              disabled={archiving}
            >
              {archiving ? 'Preparing archive…' : 'Archive project'}
            </button>
          )}
          {archiveError && <p style={{ color: 'crimson', fontSize: 12, margin: 0 }}>{archiveError}</p>}
          {user && user.instanceRole === 'ADMIN' && (
            <ProjectMembersPanel projectId={projectId} />
          )}
          {user && user.instanceRole === 'ADMIN' && (
            <NotificationChannelsPanel projectId={projectId} />
          )}
        </div>

        {project.songs.length === 0 && (
          <p className="text-muted" style={{ padding: '0 16px', fontSize: 13 }}>No songs yet.</p>
        )}

        {project.songs.map((song) => {
          const expanded = expandedSongIds.has(song.id);
          return (
            <div key={song.id}>
              <div className={`tree-song-row${selectedSongId === song.id ? ' selected' : ''}`}>
                <button
                  type="button"
                  className="tree-song-toggle"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${song.title} tracks`}
                  onClick={() => toggleSongExpanded(song.id)}
                >
                  <span className={`tree-chevron${expanded ? ' open' : ''}`} aria-hidden="true">
                    ▸
                  </span>
                </button>
                <button type="button" className="tree-song" onClick={() => selectSong(song.id)}>
                  {song.title}
                  <span className="mono tree-song-count">{song.tracks.length}</span>
                </button>
              </div>
              {expanded && (
                <>
                  {song.tracks.map((track) => (
                    <button
                      key={track.id}
                      className={`tree-row${selectedTrackId === track.id ? ' active' : ''}`}
                      onClick={() => selectTrack(song.id, track.id)}
                    >
                      {track.name}
                      <span className="mono tree-take">
                        {track.currentTake ? `take ${track.currentTake.takeNumber}` : 'no take'}
                      </span>
                    </button>
                  ))}
                  {canUpload && (
                    <div style={{ padding: '4px 16px 0' }}>
                      <AddTrackForm songId={song.id} onCreated={load} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {canUpload && (
          <div style={{ padding: '4px 16px 0' }}>
            <AddSongForm projectId={projectId} onCreated={load} />
          </div>
        )}

        <div className="sidebar-footer">
          <TodosPanel parentType="project" parentId={projectId} projectId={projectId} label="Project to-dos" />
        </div>
      </div>

      {selectedSong && (
        <>
          <div className="main-col">
            <div className="main-col-header">
              <div>
                <span className="mono text-muted">Song</span>
                <h2 style={{ margin: 0, fontSize: 28 }}>{selectedSong.title}</h2>
              </div>
              <div className="main-col-actions">
                <SongStatusBadge status={selectedSong.status} />
                {canUpload && (
                  <BatchUploadForm songId={selectedSong.id} projectId={projectId} tracks={selectedSong.tracks} onUploaded={load} />
                )}
                <DownloadPanel songId={selectedSong.id} />
                <FreezeControl song={selectedSong} myRole={project.myRole} onChange={load} />
              </div>
            </div>

            <div className="tab-row">
              {DESKTOP_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`tab${activeTab === tab.key ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'tracks' && (
              <>
                <div className="card blueprint" style={{ position: 'relative', padding: '4px 18px' }}>
                  <i className="corner tl" />
                  <i className="corner tr" />
                  <i className="corner bl" />
                  <i className="corner br" />
                  {selectedSong.tracks.length === 0 && (
                    <p className="text-muted" style={{ padding: '12px 0' }}>No tracks yet.</p>
                  )}
                  <ul style={{ margin: 0, padding: 0 }}>
                    {selectedSong.tracks.map((track) => (
                      <TrackRow key={track.id} track={track} onUploaded={load} user={user} myRole={project.myRole} />
                    ))}
                  </ul>
                </div>
                {canUpload && (
                  <div style={{ marginTop: 10 }}>
                    <AddTrackForm songId={selectedSong.id} onCreated={load} />
                  </div>
                )}
                <MixApprovalSummary song={selectedSong} user={user} />
              </>
            )}

            {activeTab === 'mixes' && (
              <MixPanel songId={selectedSong.id} user={user} onChange={load} embedded />
            )}

            {activeTab === 'todos' && (
              <TodosPanel parentType="song" parentId={selectedSong.id} projectId={projectId} label="Song to-dos" embedded />
            )}

            {activeTab === 'activity' && (
              <div className="card blueprint" style={{ position: 'relative' }}>
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />
                <p className="text-muted" style={{ margin: 0 }}>Activity log — coming soon.</p>
              </div>
            )}

            {activeTab === 'notes' && (
              <AnnotationsPanel parentType="song" parentId={selectedSong.id} label="Notes" embedded />
            )}
          </div>

          <div className="rail">
            <div>
              <div className="mono rail-section-label">To-dos</div>
              <div className="rail-panel">
                <TodosPanel parentType="song" parentId={selectedSong.id} projectId={projectId} label="Song to-dos" embedded />
              </div>
            </div>
            <div>
              <div className="mono rail-section-label">Notes</div>
              <div className="rail-panel">
                <AnnotationsPanel parentType="song" parentId={selectedSong.id} label="Notes" embedded />
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bottombar">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? 'active' : ''}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

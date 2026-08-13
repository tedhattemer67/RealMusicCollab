import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProject, freezeSong, getUnfreezeRequests, requestUnfreeze, resolveUnfreezeRequest, archiveProject } from '../api';
import TrackRow from '../components/TrackRow.jsx';
import Badge from '../components/Badge.jsx';
import AddTrackForm from '../components/AddTrackForm.jsx';
import AddSongForm from '../components/AddSongForm.jsx';
import BatchUploadForm from '../components/BatchUploadForm.jsx';
import AnnotationsPanel from '../components/AnnotationsPanel.jsx';
import TodosPanel from '../components/TodosPanel.jsx';
import MixPanel from '../components/MixPanel.jsx';
import DownloadPanel from '../components/DownloadPanel.jsx';

function SongStatusBadge({ status }) {
  if (status === 'FROZEN') return <Badge color="blue">frozen</Badge>;
  if (status === 'PENDING_REAPPROVAL') return <Badge color="amber">pending re-approval</Badge>;
  return <Badge color="gray">draft</Badge>;
}

// Freeze/unfreeze — each song needs its own independent state, same
// reasoning as the mix-related components extracted into their own files.
function FreezeControl({ song, user, onChange }) {
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

  const isAdmin = user && user.instanceRole === 'ADMIN';

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
    <span style={{ marginLeft: 8 }}>
      {(song.status === 'DRAFT' || song.status === 'PENDING_REAPPROVAL') && isAdmin && (
        <button onClick={handleFreeze} disabled={busy}>
          {busy ? 'Freezing…' : 'Freeze'}
        </button>
      )}
      {song.status === 'FROZEN' && loaded && !openRequest && (
        <button onClick={handleRequestUnfreeze} disabled={busy}>
          {busy ? 'Requesting…' : 'Request unfreeze'}
        </button>
      )}
      {song.status === 'FROZEN' && openRequest && (
        <span style={{ fontSize: 12, color: '#854f0b', marginLeft: 4 }}>
          Unfreeze requested by {openRequest.requestedBy?.name || 'someone'}
          {isAdmin && (
            <>
              {' '}
              <button onClick={() => handleResolve(true)} disabled={busy} style={{ marginLeft: 4 }}>
                Approve
              </button>
              <button onClick={() => handleResolve(false)} disabled={busy} style={{ marginLeft: 4 }}>
                Deny
              </button>
            </>
          )}
        </span>
      )}
      {error && <span style={{ color: 'crimson', fontSize: 12, marginLeft: 6 }}>{error}</span>}
    </span>
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
    load();
  }, [load]);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!project) return <p>Loading…</p>;

  return (
    <div>
      <p>
        <Link to="/">&larr; All projects</Link>
      </p>
      <h2 style={{ fontSize: 18 }}>{project.name}</h2>
      {user && user.instanceRole === 'ADMIN' && (
        <button onClick={handleArchive} disabled={archiving} style={{ fontSize: 13, marginBottom: 8 }}>
          {archiving ? 'Preparing archive…' : 'Archive project'}
        </button>
      )}
      {archiveError && <p style={{ color: 'crimson', fontSize: 13 }}>{archiveError}</p>}
      <TodosPanel parentType="project" parentId={projectId} label="Project to-dos" />
      {project.songs.length === 0 && <p>No songs yet.</p>}
      <ul>
        {project.songs.map((song) => (
          <li key={song.id} style={{ marginBottom: 16 }}>
            <div>
              <strong>{song.title}</strong>
              <SongStatusBadge status={song.status} />
              <FreezeControl song={song} user={user} onChange={load} />
              <MixPanel songId={song.id} user={user} onChange={load} />
              <DownloadPanel songId={song.id} />
            </div>
            <AnnotationsPanel parentType="song" parentId={song.id} label="Song comments" />
            <TodosPanel parentType="song" parentId={song.id} label="Song to-dos" />
            <ul style={{ marginTop: 4 }}>
              {song.tracks.map((track) => (
                <TrackRow key={track.id} track={track} onUploaded={load} user={user} />
              ))}
            </ul>
            <AddTrackForm songId={song.id} onCreated={load} />
            <BatchUploadForm songId={song.id} tracks={song.tracks} onUploaded={load} />
          </li>
        ))}
      </ul>
      <AddSongForm projectId={projectId} onCreated={load} />
    </div>
  );
}

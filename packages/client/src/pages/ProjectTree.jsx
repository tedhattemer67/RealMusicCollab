import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProject, getMixApprovals, approveMix, freezeSong, getUnfreezeRequests, requestUnfreeze, resolveUnfreezeRequest } from '../api';
import TrackRow from '../components/TrackRow.jsx';
import Badge from '../components/Badge.jsx';
import AddTrackForm from '../components/AddTrackForm.jsx';
import AddSongForm from '../components/AddSongForm.jsx';
import BatchUploadForm from '../components/BatchUploadForm.jsx';
import AnnotationsPanel from '../components/AnnotationsPanel.jsx';

function SongStatusBadge({ status }) {
  if (status === 'FROZEN') return <Badge color="blue">frozen</Badge>;
  if (status === 'PENDING_REAPPROVAL') return <Badge color="amber">pending re-approval</Badge>;
  return <Badge color="gray">draft</Badge>;
}

// Each song needs its own independent approval state, which is why this is
// a real component rather than logic inlined in a .map() — hooks can't be
// shared across loop iterations that way.
function MixApprovalControl({ mix, user }) {
  const [approvals, setApprovals] = useState(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMixApprovals(mix.id)
      .then(setApprovals)
      .catch(() => setApprovals(null));
  }, [mix.id]);

  const myApproval = approvals && user ? approvals.find((a) => a.userId === user.id) : null;

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      await approveMix(mix.id);
      const fresh = await getMixApprovals(mix.id);
      setApprovals(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <span style={{ marginLeft: 8 }}>
      {approvals && approvals.length > 0 && <Badge color="green">approved</Badge>}
      {approvals && approvals.length === 0 && <Badge color="amber">pending approval</Badge>}
      {user && user.instanceRole !== 'VIEWER' && (
        myApproval ? (
          <span style={{ marginLeft: 6, fontSize: 12, color: '#3b6d11' }}>✓ You approved this</span>
        ) : (
          <button onClick={handleApprove} disabled={approving} style={{ marginLeft: 6 }}>
            {approving ? 'Approving…' : 'Approve mix'}
          </button>
        )
      )}
      {error && <span style={{ color: 'crimson', fontSize: 12, marginLeft: 6 }}>{error}</span>}
    </span>
  );
}

// Freeze/unfreeze — reuses the same "each song needs independent state"
// reasoning as MixApprovalControl above.
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
  // Which song's mix player is currently shown, if any — a single id
  // rather than per-song state, since only one is realistically open at once.
  const [playingMixSongId, setPlayingMixSongId] = useState(null);

  function togglePlayMix(songId) {
    setPlayingMixSongId((cur) => (cur === songId ? null : songId));
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
      {project.songs.length === 0 && <p>No songs yet.</p>}
      <ul>
        {project.songs.map((song) => (
          <li key={song.id} style={{ marginBottom: 16 }}>
            <div>
              <strong>{song.title}</strong>
              <SongStatusBadge status={song.status} />
              <FreezeControl song={song} user={user} onChange={load} />
              {song.currentMix && (
                <span>
                  {' '}
                  — mix v{song.currentMix.mixNumber} ({song.currentMix.status})
                </span>
              )}
              {song.currentMix && <MixApprovalControl mix={song.currentMix} user={user} />}
              <button
                onClick={() => togglePlayMix(song.id)}
                disabled={!song.currentMix}
                style={{ marginLeft: 8 }}
                title="Plays the song's actual balanced mix, not an isolated track"
              >
                {playingMixSongId === song.id ? 'Hide mix' : 'Play mix'}
              </button>
            </div>
            <AnnotationsPanel parentType="song" parentId={song.id} />
            {playingMixSongId === song.id && song.currentMix && (
              <div style={{ margin: '6px 0' }}>
                <audio
                  controls
                  src={`/api/mixes/${song.currentMix.id}/stream`}
                  style={{ width: '100%' }}
                />
              </div>
            )}
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

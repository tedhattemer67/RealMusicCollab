import { useEffect, useState, useCallback } from 'react';
import {
  getProjectMembers,
  getUsers,
  addProjectMember,
  updateProjectMember,
  removeProjectMember,
} from '../api';

const ROLES = ['ADMIN', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER'];

// Instance-ADMIN only — the panel is rendered only for instance admins in
// ProjectTree. Collapsed behind a toggle like NotificationChannelsPanel,
// since managing the roster isn't something every visit needs open.
export default function ProjectMembersPanel({ projectId }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('VIEWER');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    getProjectMembers(projectId)
      .then(setMembers)
      .catch((err) => setError(err.message));
    getUsers()
      .then(setAllUsers)
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (open && members === null) load();
  }, [open, members, load]);

  const memberIds = new Set((members || []).map((m) => m.userId));
  const addableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  async function handleAdd(e) {
    e.preventDefault();
    if (!addUserId) return;
    setAdding(true);
    setError(null);
    try {
      await addProjectMember(projectId, addUserId, addRole);
      setAddUserId('');
      setAddRole('VIEWER');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(userId, role) {
    setBusyId(userId);
    setError(null);
    try {
      await updateProjectMember(projectId, userId, role);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(userId) {
    setBusyId(userId);
    setError(null);
    try {
      await removeProjectMember(projectId, userId);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!open) {
    return (
      <button
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start', paddingInline: 0 }}
        onClick={() => setOpen(true)}
      >
        Members
      </button>
    );
  }

  return (
    <div className="card blueprint" style={{ position: 'relative', marginTop: 10, maxWidth: 360 }}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="card-title">Project members</span>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {members === null && <p className="text-muted" style={{ fontSize: 12 }}>Loading…</p>}

      {members && members.length === 0 && (
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
          No one is on this project yet. Add someone below — until you do, only instance admins can see it.
        </p>
      )}

      {members && members.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map((m) => (
            <li key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.email}>
                {m.name}
                {!m.active && <span className="mono text-muted"> (inactive)</span>}
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="input"
                  style={{ minHeight: 28, fontSize: 12 }}
                  value={m.role}
                  disabled={busyId === m.userId}
                  onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost"
                  disabled={busyId === m.userId}
                  onClick={() => handleRemove(m.userId)}
                  title="Remove from project"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        <select
          className="input"
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
        >
          <option value="">Add a person…</option>
          {addableUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select className="input" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={adding || !addUserId}>
          {adding ? 'Adding…' : 'Add to project'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}

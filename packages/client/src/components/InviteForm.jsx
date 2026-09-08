import { useState, useEffect } from 'react';
import { createInvite, getProjects } from '../api';

const ROLES = ['ADMIN', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER'];

// Instance-ADMIN only (rendered from Members for admins). An invite either
// puts someone straight onto a project at a chosen role, or — with no
// project — creates another instance administrator.
export default function InviteForm() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [role, setRole] = useState('CONTRIBUTOR');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    if (open) {
      getProjects()
        .then(setProjects)
        .catch(() => {});
    }
  }, [open]);

  const instanceAdminInvite = projectId === '';

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = instanceAdminInvite ? { role: 'ADMIN' } : { role, projectId };
      const result = await createInvite(body);
      setInvite(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function closeAndReset() {
    setInvite(null);
    setProjectId('');
    setRole('CONTRIBUTOR');
    setOpen(false);
  }

  const inviteUrl = invite ? `${window.location.origin}/invite/${invite.token}` : null;

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        + Invite someone
      </button>
    );
  }

  return (
    <div className="card blueprint" style={{ position: 'relative', marginTop: 12, maxWidth: 400 }}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      {!invite ? (
        <form onSubmit={handleSubmit}>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Project</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Instance administrator (no project) —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {!instanceAdminInvite && (
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Role on this project</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          {instanceAdminInvite && (
            <p className="text-muted" style={{ fontSize: 13, margin: '0 0 10px' }}>
              This link creates a full instance administrator — access to every project.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Generating…' : 'Generate invite link'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {error && <p style={{ margin: '6px 0 0', color: 'crimson', fontSize: 13 }}>{error}</p>}
        </form>
      ) : (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13 }}>
            Share this link — it's single-use, and grants <strong>{invite.role}</strong>
            {invite.projectId ? ' on that project' : ' instance-wide'}:
          </p>
          <input
            className="input"
            type="text"
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.target.select()}
          />
          <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={closeAndReset}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

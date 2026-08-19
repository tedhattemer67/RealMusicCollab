import { useState } from 'react';
import { createInvite } from '../api';

const ROLES = ['ADMIN', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER'];

export default function InviteForm() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState('CONTRIBUTOR');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [invite, setInvite] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await createInvite({ role });
      setInvite(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function closeAndReset() {
    setInvite(null);
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
            <label>Role this invite grants</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
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
            Share this link — it's single-use, and grants <strong>{invite.role}</strong>:
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

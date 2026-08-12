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
      <button onClick={() => setOpen(true)} style={{ marginTop: 12, fontSize: 13 }}>
        + Invite someone
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 12,
        fontSize: 14,
        border: '1px solid #ddd',
        padding: 12,
        borderRadius: 6,
        maxWidth: 400,
      }}
    >
      {!invite ? (
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 10 }}>
            Role this invite grants:{' '}
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Generating…' : 'Generate invite link'}
          </button>
          <button type="button" onClick={() => setOpen(false)} style={{ marginLeft: 6 }}>
            Cancel
          </button>
          {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
        </form>
      ) : (
        <div>
          <p style={{ margin: '0 0 8px' }}>
            Share this link — it's single-use, and grants <strong>{invite.role}</strong>:
          </p>
          <input
            type="text"
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.target.select()}
            style={{ width: '100%', padding: 6, fontSize: 13, boxSizing: 'border-box' }}
          />
          <button onClick={closeAndReset} style={{ marginTop: 10 }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

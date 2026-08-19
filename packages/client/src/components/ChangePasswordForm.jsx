import { useState } from 'react';
import { changePassword } from '../api';

export default function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function closeAndReset() {
    setCurrentPassword('');
    setNewPassword('');
    setDone(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        Change my password
      </button>
    );
  }

  return (
    <div className="card blueprint" style={{ position: 'relative', marginTop: 12, maxWidth: 400 }}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      {!done ? (
        <form onSubmit={handleSubmit}>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Current password</label>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>New password</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save new password'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {error && <p style={{ margin: '6px 0 0', color: 'crimson', fontSize: 13 }}>{error}</p>}
        </form>
      ) : (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13 }}>Password updated.</p>
          <button className="btn btn-primary" onClick={closeAndReset}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { getUsers } from '../api';
import InviteForm from '../components/InviteForm.jsx';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';
import ResetPasswordControl from '../components/ResetPasswordControl.jsx';
import './Members.css';

export default function Members({ user }) {
  const isAdmin = user.instanceRole === 'ADMIN';
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);

  // The full account list is instance-ADMIN only now (per-project isolation —
  // one band shouldn't see the whole instance's roster). Non-admins only get
  // the "Your account" section below.
  const load = useCallback(() => {
    if (!isAdmin) return;
    getUsers()
      .then(setUsers)
      .catch((err) => setError(err.message));
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="members-page">
      {isAdmin && (
        <>
          <h2>Everyone on this instance</h2>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          {!users && !error && <p className="text-muted">Loading…</p>}
          {users && (
            <ul className="members-list">
              {users.map((u) => (
                <li key={u.id} className="members-list-item">
                  <span>{u.name}</span>
                  <span className="tag tag-neutral">{u.instanceRole}</span>
                  {u.id !== user.id && <ResetPasswordControl userId={u.id} userName={u.name} />}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted" style={{ fontSize: 13 }}>
            Add people to individual projects from each project’s <strong>Members</strong> panel.
          </p>
          <InviteForm />
        </>
      )}

      <h3 style={{ marginTop: isAdmin ? 32 : 0 }}>Your account</h3>
      <ChangePasswordForm />
    </div>
  );
}

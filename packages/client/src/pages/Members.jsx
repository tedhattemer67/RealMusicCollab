import { useEffect, useState, useCallback } from 'react';
import { getUsers } from '../api';
import InviteForm from '../components/InviteForm.jsx';
import './Members.css';

export default function Members({ user }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getUsers()
      .then(setUsers)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p style={{ color: 'crimson', padding: 24 }}>{error}</p>;
  if (!users) return <p className="text-muted" style={{ padding: 24 }}>Loading…</p>;

  return (
    <div className="members-page">
      <h2>Band members</h2>
      <ul className="members-list">
        {users.map((u) => (
          <li key={u.id} className="members-list-item">
            <span>{u.name}</span>
            <span className="tag tag-neutral">{u.instanceRole}</span>
          </li>
        ))}
      </ul>
      {/* Only Admins can actually create an invite on the backend — hiding
          this for everyone else avoids showing a button that would just 403. */}
      {user.instanceRole === 'ADMIN' && <InviteForm />}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { getUsers } from '../api';
import InviteForm from '../components/InviteForm.jsx';

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

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!users) return <p>Loading…</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Band members</h2>
      <ul>
        {users.map((u) => (
          <li key={u.id} style={{ marginBottom: 6 }}>
            {u.name} — <em>{u.instanceRole}</em>
          </li>
        ))}
      </ul>
      {/* Only Admins can actually create an invite on the backend — hiding
          this for everyone else avoids showing a button that would just 403. */}
      {user.instanceRole === 'ADMIN' && <InviteForm />}
    </div>
  );
}

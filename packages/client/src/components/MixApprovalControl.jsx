import { useState, useEffect } from 'react';
import { getMixApprovals, approveMix } from '../api';
import Badge from './Badge.jsx';

// Each mix needs its own independent approval state, which is why this is
// a real component rather than logic inlined in a list — hooks can't be
// shared across loop iterations that way.
export default function MixApprovalControl({ mix, user }) {
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {approvals && approvals.length > 0 && <Badge variant="accent">approved</Badge>}
      {approvals && approvals.length === 0 && <Badge variant="outline">pending approval</Badge>}
      {user &&
        user.instanceRole !== 'VIEWER' &&
        (myApproval ? (
          <span className="text-muted" style={{ fontSize: 12 }}>✓ You approved this</span>
        ) : (
          <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
            {approving ? 'Approving…' : 'Approve'}
          </button>
        ))}
      {error && <span style={{ color: 'crimson', fontSize: 12 }}>{error}</span>}
    </span>
  );
}

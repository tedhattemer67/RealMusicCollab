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

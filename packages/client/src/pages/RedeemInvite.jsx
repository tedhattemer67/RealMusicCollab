import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { previewInvite, redeemInvite } from '../api';

export default function RedeemInvite({ onRedeemed }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    previewInvite(token)
      .then(setPreview)
      .catch((err) => setPreviewError(err.message));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await redeemInvite(token, { name, email, password });
      // Redeeming logs you straight in — the backend now creates a real
      // session as part of this, no separate login step needed.
      onRedeemed(user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (previewError) {
    return (
      <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'sans-serif' }}>
        <p style={{ color: 'crimson' }}>{previewError}</p>
      </div>
    );
  }
  if (!preview) {
    return (
      <p style={{ textAlign: 'center', marginTop: 80, fontFamily: 'sans-serif' }}>Loading…</p>
    );
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>Join the band</h1>
      <p style={{ color: '#555', fontSize: 14 }}>
        You've been invited as a <strong>{preview.role}</strong>
        {preview.scope === 'project' ? ` on ${preview.projectName}` : ' across the whole band'}.
      </p>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, boxSizing: 'border-box' }}
            required
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, boxSizing: 'border-box' }}
            required
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, boxSizing: 'border-box' }}
            required
            minLength={8}
          />
        </div>
        {error && <p style={{ color: 'crimson', fontSize: 14 }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: '8px 16px' }}>
          {submitting ? 'Joining…' : 'Join'}
        </button>
      </form>
    </div>
  );
}

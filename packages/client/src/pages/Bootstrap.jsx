import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkBootstrapAvailable, bootstrapFirstAdmin } from '../api';

export default function Bootstrap({ onLoggedIn }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkBootstrapAvailable()
      .then((res) => setAvailable(res.available))
      .catch(() => setAvailable(false))
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await bootstrapFirstAdmin({ name, email, password });
      onLoggedIn(user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <p style={{ textAlign: 'center', marginTop: 80, fontFamily: 'sans-serif' }}>Checking…</p>
    );
  }

  if (!available) {
    return (
      <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'sans-serif' }}>
        <p>This instance already has an account set up.</p>
        <p>
          <a href="/login">Go to login</a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>Set up the first Admin account</h1>
      <p style={{ color: '#555', fontSize: 14 }}>
        This instance has no accounts yet — whoever fills this out becomes the first Admin.
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
          {submitting ? 'Creating…' : 'Create Admin account'}
        </button>
      </form>
    </div>
  );
}

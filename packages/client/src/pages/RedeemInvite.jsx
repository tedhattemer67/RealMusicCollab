import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { previewInvite, redeemInvite, logout } from '../api';
import './RedeemInvite.css';

export default function RedeemInvite({ user, onRedeemed, onLoggedOut }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [accountExists, setAccountExists] = useState(false);

  useEffect(() => {
    previewInvite(token)
      .then(setPreview)
      .catch((err) => setPreviewError(err.message));
  }, [token]);

  // Already signed in: the session cookie proves who they are, so this is
  // "attach the invite's grant to my existing account" — no signup form.
  async function handleJoin() {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await redeemInvite(token);
      onRedeemed(updated);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setAccountExists(false);
    try {
      const newUser = await redeemInvite(token, { name, email, password });
      // Redeeming logs you straight in — the backend now creates a real
      // session as part of this, no separate login step needed.
      onRedeemed(newUser);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setAccountExists(Boolean(err.data?.accountExists));
    } finally {
      setSubmitting(false);
    }
  }

  if (previewError) {
    return <div className="invite-error-screen">{previewError}</div>;
  }
  if (!preview) {
    return <div className="invite-loading">Loading…</div>;
  }

  return (
    <div className="invite-screen">
      <div className="invite-rail">
        <div>
          <div className="invite-kicker">Sheet 02 · Invite redemption</div>
          <div className="invite-headline">
            Real Music
            <br />
            Collab
          </div>
        </div>
        <div className="invite-details">
          <div className="invite-detail-row">
            <span>Role</span>
            <span className="invite-detail-annotation">{preview.role}</span>
          </div>
          <div className="invite-detail-row">
            <span>Access</span>
            <span className="invite-detail-annotation">
              {preview.scope === 'project' ? preview.projectName : 'whole band'}
            </span>
          </div>
        </div>
        <p className="invite-support-copy">
          You've been invited as a <strong>{preview.role}</strong>
          {preview.scope === 'project' ? ` on ${preview.projectName}` : ' across the whole band'}.
          One room per project. Every take keeps its number, every mix remembers which takes it
          was printed from.
        </p>
      </div>

      <div className="invite-form-column">
        {user ? (
          <div className="card blueprint invite-card">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <h3>Join the band</h3>
            <p className="invite-support-copy">
              Signed in as <strong>{user.name}</strong> ({user.email}).
            </p>
            {error && <p className="invite-error">{error}</p>}
            <button
              type="button"
              onClick={handleJoin}
              disabled={submitting}
              className="btn btn-primary btn-block blueprint"
              style={{ height: 40, position: 'relative' }}
            >
              {submitting ? 'Joining…' : 'Join'}
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />
            </button>
            <p className="invite-support-copy">
              Not you?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
                Log out
              </a>{' '}
              first.
            </p>
          </div>
        ) : (
          <form className="card blueprint invite-card" onSubmit={handleSubmit}>
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <h3>Join the band</h3>
            <div className="field invite-field-group">
              <label>Name</label>
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && (
              <p className="invite-error">
                {error}
                {accountExists && (
                  <>
                    {' '}
                    <Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Log in</Link>
                  </>
                )}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-block blueprint"
              style={{ height: 40, position: 'relative' }}
            >
              {submitting ? 'Joining…' : 'Join'}
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

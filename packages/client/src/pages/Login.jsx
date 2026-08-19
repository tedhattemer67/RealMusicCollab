import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api';
import './Login.css';

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      onLoggedIn(user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-rail">
        <div>
          <div className="login-kicker">Sheet 01 · Session access</div>
          <div className="login-headline">
            Real Music
            <br />
            Collab
          </div>
        </div>
        <div className="login-features">
          <div className="login-feature-row">
            <span>Projects</span>
            <span className="login-feature-annotation">admin creates</span>
          </div>
          <div className="login-feature-row">
            <span>Songs → Tracks → Takes</span>
            <span className="login-feature-annotation">contributor uploads</span>
          </div>
          <div className="login-feature-row">
            <span>Mixes</span>
            <span className="login-feature-annotation">frozen manifest</span>
          </div>
          <div className="login-feature-row">
            <span>Notes &amp; to-dos</span>
            <span className="login-feature-annotation">everyone</span>
          </div>
        </div>
        <p className="login-support-copy">
          One room per project. Every take keeps its number, every mix remembers which takes it
          was printed from.
        </p>
        <div className="login-build-tag">Build 1.0 · Steel accent #5980A6</div>
      </div>

      <div className="login-form-column">
        <form className="card blueprint login-card" onSubmit={handleSubmit}>
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          <h3>Log in</h3>
          <p className="login-card-subtitle">Session cookie, not a token. Refresh keeps you in.</p>
          <div className="field login-field-group">
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
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block blueprint"
            style={{ height: 40, position: 'relative' }}
          >
            {loading ? 'Logging in…' : 'Log in'}
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
          </button>
          <div className="login-card-footer">
            <a className="login-forgot-link" href="#">
              Forgot password
            </a>
            <span className="login-invite-only">Invite only</span>
          </div>
        </form>
      </div>
    </div>
  );
}

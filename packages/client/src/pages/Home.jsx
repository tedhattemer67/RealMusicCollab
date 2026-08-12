import { Routes, Route, Link } from 'react-router-dom';
import { logout } from '../api';
import ProjectList from './ProjectList.jsx';
import ProjectTree from './ProjectTree.jsx';
import Members from './Members.jsx';

export default function Home({ user, onLoggedOut }) {
  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Logged in as {user.name}</h1>
          <p style={{ color: '#555', margin: 0 }}>Role: {user.instanceRole}</p>
        </div>
        <button onClick={handleLogout} style={{ padding: '8px 16px' }}>
          Log out
        </button>
      </div>
      <nav style={{ marginBottom: 16, fontSize: 14 }}>
        <Link to="/">Projects</Link>
        {' | '}
        <Link to="/members">Band</Link>
      </nav>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:projectId" element={<ProjectTree user={user} />} />
        <Route path="/members" element={<Members user={user} />} />
      </Routes>
    </div>
  );
}

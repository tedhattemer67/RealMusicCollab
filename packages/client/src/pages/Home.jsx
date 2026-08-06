import { logout } from '../api';
import ProjectTree from './ProjectTree.jsx';

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
      <ProjectTree />
    </div>
  );
}

import { Routes, Route, NavLink } from 'react-router-dom';
import { logout } from '../api';
import ProjectList from './ProjectList.jsx';
import ProjectTree from './ProjectTree.jsx';
import Members from './Members.jsx';
import ManageProjects from './ManageProjects.jsx';
import './Home.css';

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export default function Home({ user, onLoggedOut }) {
  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  return (
    <div className="app-shell">
      <div className="nav app-nav">
        <span className="nav-brand"><a href="../">Real Music Collab</a></span>
        <NavLink to="/" end>
          Projects
        </NavLink>
        <NavLink to="/members">Band</NavLink>
        {user.instanceRole === 'ADMIN' && (
          <NavLink to="/manage-projects">Manage Projects</NavLink>
        )}
        <div className="app-nav-right">
          <span className="tag tag-outline">{user.instanceRole}</span>
          <button
            className="btn btn-icon blueprint avatar-chip"
            onClick={handleLogout}
            title={`Log out (${user.name})`}
          >
            {initials(user.name)}
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
          </button>
        </div>
      </div>
      <div className="app-content">
        <Routes>
          <Route path="/" element={<ProjectList />} />
          <Route path="/projects/:projectId" element={<ProjectTree user={user} />} />
          <Route path="/members" element={<Members user={user} />} />
          <Route path="/manage-projects" element={<ManageProjects user={user} />} />
        </Routes>
      </div>
    </div>
  );
}

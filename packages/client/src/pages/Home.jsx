import { useEffect, useRef, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navRef = useRef(null);

  // Collapse the mobile menu whenever the route changes (i.e. after picking
  // a nav item) so it doesn't stay open over the newly-loaded page.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    function handleClickOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  return (
    <div className="app-shell">
      <div className="nav app-nav" ref={navRef}>
        <button
          type="button"
          className="btn btn-icon blueprint app-nav-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="app-nav-links"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <path d="M2 5H16M2 9H16M2 13H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            )}
          </svg>
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
        </button>
        <div id="app-nav-links" className="app-nav-links" data-open={menuOpen}>
          <span className="nav-brand"><a href="../">Real Music Collab</a></span>
          <NavLink to="/" end>
            Projects
          </NavLink>
          <NavLink to="/members">Band</NavLink>
          {user.instanceRole === 'ADMIN' && (
            <NavLink to="/manage-projects">Manage Projects</NavLink>
          )}
        </div>
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

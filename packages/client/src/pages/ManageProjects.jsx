import { useEffect, useState, useCallback } from 'react';
import { getAllProjects, hideProject, unhideProject } from '../api';
import './ManageProjects.css';

export default function ManageProjects({ user }) {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getAllProjects()
      .then(setProjects)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real enforcement is server-side (requireRole(['ADMIN']) on the routes
  // this page calls) — this is just defense-in-depth for someone who
  // navigates here directly without the nav link being shown.
  if (user.instanceRole !== 'ADMIN') {
    return <p style={{ padding: 24 }}>Admins only.</p>;
  }

  if (error) return <p style={{ color: 'crimson', padding: 24 }}>{error}</p>;
  if (!projects) return <p className="text-muted" style={{ padding: 24 }}>Loading…</p>;

  async function handleToggle(project) {
    try {
      if (project.hidden) {
        await unhideProject(project.id);
      } else {
        if (!window.confirm(`Hide "${project.name}" from the project list?`)) return;
        await hideProject(project.id);
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="manage-projects-page">
      <h2>Manage projects</h2>
      <ul className="manage-projects-list">
        {projects.map((p) => (
          <li key={p.id} className="manage-projects-list-item">
            <span>{p.name}</span>
            {p.hidden && <span className="tag tag-neutral">HIDDEN</span>}
            <button className="btn btn-ghost" onClick={() => handleToggle(p)}>
              {p.hidden ? 'Unhide' : 'Hide'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

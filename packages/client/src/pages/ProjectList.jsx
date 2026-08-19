import { Link } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { getProjects } from '../api';
import AddProjectForm from '../components/AddProjectForm.jsx';
import './ProjectList.css';

export default function ProjectList() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getProjects()
      .then(setProjects)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p style={{ color: 'crimson', padding: 24 }}>{error}</p>;
  if (!projects) return <p className="text-muted" style={{ padding: 24 }}>Loading…</p>;

  return (
    <div className="project-list-page">
      <h2>Projects</h2>
      {projects.length === 0 && <p className="text-muted">No projects yet.</p>}
      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id} className="card blueprint project-list-item" style={{ position: 'relative' }}>
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <Link to={`/projects/${p.id}`}>{p.name}</Link>
            {p.caption && <span className="text-muted"> — {p.caption}</span>}
          </li>
        ))}
      </ul>
      <AddProjectForm onCreated={load} />
    </div>
  );
}

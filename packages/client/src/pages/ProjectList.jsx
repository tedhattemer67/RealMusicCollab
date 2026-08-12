import { Link } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { getProjects } from '../api';
import AddProjectForm from '../components/AddProjectForm.jsx';

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

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!projects) return <p>Loading…</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>Projects</h2>
      {projects.length === 0 && <p>No projects yet.</p>}
      <ul>
        {projects.map((p) => (
          <li key={p.id} style={{ marginBottom: 8 }}>
            <Link to={`/projects/${p.id}`}>{p.name}</Link>
            {p.caption && <span style={{ color: '#777' }}> — {p.caption}</span>}
          </li>
        ))}
      </ul>
      <AddProjectForm onCreated={load} />
    </div>
  );
}

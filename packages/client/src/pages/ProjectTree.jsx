import { useEffect, useState } from 'react';
import { getProjects, getProject } from '../api';
import TrackRow from '../components/TrackRow.jsx';

// Deliberately picks the first project rather than showing a picker — a
// project list screen is the more realistic long-term shape, but this is
// the fastest way to prove real nested data renders correctly first.
export default function ProjectTree() {
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const projects = await getProjects();
        if (projects.length === 0) {
          setError('No projects found.');
          return;
        }
        const full = await getProject(projects[0].id);
        setProject(full);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, []);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!project) return <p>Loading…</p>;

  return (
    <div>
      <h2 style={{ fontSize: 18 }}>{project.name}</h2>
      {project.songs.length === 0 && <p>No songs yet.</p>}
      <ul>
        {project.songs.map((song) => (
          <li key={song.id} style={{ marginBottom: 16 }}>
            <div>
              <strong>{song.title}</strong> — <em>{song.status}</em>
              {song.currentMix && (
                <span>
                  {' '}
                  — mix v{song.currentMix.mixNumber} ({song.currentMix.status})
                </span>
              )}
            </div>
            <ul style={{ marginTop: 4 }}>
              {song.tracks.map((track) => (
                <TrackRow key={track.id} track={track} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

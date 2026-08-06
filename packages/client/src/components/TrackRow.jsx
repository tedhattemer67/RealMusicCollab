import { useState } from 'react';
import { getTrackTakes } from '../api';

export default function TrackRow({ track }) {
  const [expanded, setExpanded] = useState(false);
  const [takes, setTakes] = useState(null);
  const [loading, setLoading] = useState(false);

  // Take history is only fetched the first time a track is expanded, not
  // up front for every track in the tree — matches the "collapsed by
  // default" behavior from the original mockups, and avoids loading data
  // nobody's asked to see yet.
  async function toggleExpand() {
    if (!expanded && takes === null) {
      setLoading(true);
      try {
        const data = await getTrackTakes(track.id);
        setTakes(data);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((e) => !e);
  }

  return (
    <li style={{ marginBottom: 4 }}>
      <div>
        <strong>{track.name}</strong>{' '}
        {track.currentTake ? `— current: Take ${track.currentTake.takeNumber}` : '— no current take'}{' '}
        (<em>
          {track._count.takes} take{track._count.takes === 1 ? '' : 's'}
        </em>)
        <button onClick={toggleExpand} style={{ marginLeft: 8 }}>
          {expanded ? 'Hide takes' : 'Show takes'}
        </button>
      </div>
      {expanded && (
        <ul style={{ marginTop: 4 }}>
          {loading && <li>Loading…</li>}
          {takes &&
            takes.map((t) => (
              <li key={t.id}>
                Take {t.takeNumber} — performed by {t.performedBy?.name || 'unknown'}
                {t.note ? ` — "${t.note}"` : ''}
              </li>
            ))}
        </ul>
      )}
    </li>
  );
}

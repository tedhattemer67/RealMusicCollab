import { useState, useRef, useEffect } from 'react';
import { batchPreview, batchUpload, getUsers } from '../api';

// Three steps, deliberately kept separate: picking files, reviewing what
// the parser suggests (fully editable — nothing saved yet), and only then
// actually uploading. batch-preview is called with filenames only; the
// real files never leave the browser until the review is confirmed.
export default function BatchUploadForm({ songId, projectId, tracks, onUploaded }) {
  const [step, setStep] = useState('idle'); // idle | picking | review | done
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (step === 'picking' || step === 'review') {
      getUsers(projectId)
        .then(setUsers)
        .catch(() => {});
    }
  }, [step, projectId]);

  function handleFilesChosen(e) {
    setFiles(Array.from(e.target.files));
  }

  async function handlePreview() {
    if (files.length === 0) {
      setError('Choose at least one file first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const filenames = files.map((f) => f.name);
      const { preview } = await batchPreview(songId, filenames);
      const initialRows = preview.map((p) => ({
        filename: p.filename,
        name: p.matchedTrackName || p.candidateName,
        targetMode: p.matchedTrackId ? 'existing' : 'new',
        trackId: p.matchedTrackId || '',
        performedById: '',
        note: '',
      }));
      setRows(initialRows);
      setStep('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateRow(index, changes) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  }

  async function handleConfirmUpload() {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f, f.name));

      const items = rows.map((r) => ({
        filename: r.filename,
        name: r.name,
        action: r.targetMode === 'existing' ? 'add-take' : 'new-track',
        trackId: r.targetMode === 'existing' ? r.trackId : undefined,
        performedById: r.performedById || undefined,
        note: r.note || undefined,
      }));
      formData.append('items', JSON.stringify(items));

      const result = await batchUpload(songId, formData);
      setResults(result);
      setStep('done');
      if (onUploaded) onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep('idle');
    setFiles([]);
    setRows([]);
    setResults(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (step === 'idle') {
    return (
      <button className="btn btn-secondary" onClick={() => setStep('picking')}>
        Batch upload
      </button>
    );
  }

  if (step === 'picking') {
    return (
      <div className="card blueprint" style={{ position: 'relative', marginTop: 8 }}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <p className="card-title" style={{ margin: 0 }}>Batch upload — pick your stem files</p>
        <input type="file" multiple ref={fileInputRef} accept=".wav,audio/wav" onChange={handleFilesChosen} />
        {files.length > 0 && (
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>{files.length} file(s) selected</p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handlePreview} disabled={loading}>
            {loading ? 'Checking…' : 'Preview'}
          </button>
          <button className="btn btn-secondary" onClick={reset}>
            Cancel
          </button>
        </div>
        {error && <p style={{ color: 'crimson', fontSize: 13, margin: 0 }}>{error}</p>}
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="card blueprint" style={{ position: 'relative', marginTop: 8 }}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <p className="card-title" style={{ margin: 0 }}>
          Review before uploading — nothing has been saved yet
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Track name</th>
                <th>Target</th>
                <th>Performer</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.filename}>
                  <td
                    style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={row.filename}
                  >
                    {row.filename}
                  </td>
                  <td>
                    <input
                      className="input"
                      type="text"
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      style={{ minHeight: 32, width: 120 }}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ minHeight: 32 }}
                      value={row.targetMode === 'existing' ? row.trackId : 'new'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'new') {
                          updateRow(i, { targetMode: 'new', trackId: '' });
                        } else {
                          updateRow(i, { targetMode: 'existing', trackId: val });
                        }
                      }}
                    >
                      <option value="new">+ New track</option>
                      {tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          Add take: {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ minHeight: 32 }}
                      value={row.performedById}
                      onChange={(e) => updateRow(i, { performedById: e.target.value })}
                    >
                      <option value="">(me)</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      type="text"
                      value={row.note}
                      onChange={(e) => updateRow(i, { note: e.target.value })}
                      style={{ minHeight: 32, width: 120 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleConfirmUpload} disabled={loading}>
            {loading ? 'Uploading…' : `Upload ${rows.length} file(s)`}
          </button>
          <button className="btn btn-secondary" onClick={reset}>
            Cancel
          </button>
        </div>
        {error && <p style={{ color: 'crimson', fontSize: 13, margin: 0 }}>{error}</p>}
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="card blueprint" style={{ position: 'relative', marginTop: 8 }}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <p className="card-title" style={{ margin: 0 }}>Batch upload complete</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {results.results.map((r) => (
            <li key={r.filename} style={{ color: r.error ? 'crimson' : 'inherit', fontSize: 13 }}>
              {r.filename}
              {r.error
                ? ` — ${r.error}`
                : ` — take ${r.takeNumber}${r.promotedToDefault ? ' (set as default)' : ' (pending promotion)'}`}
            </li>
          ))}
        </ul>
        {results.unfreezeRequestCreated && (
          <p style={{ color: 'var(--color-accent-700)', fontSize: 13, margin: 0 }}>
            This song was frozen — an unfreeze request was created.
          </p>
        )}
        <button className="btn btn-secondary" onClick={reset}>
          Close
        </button>
      </div>
    );
  }

  return null;
}

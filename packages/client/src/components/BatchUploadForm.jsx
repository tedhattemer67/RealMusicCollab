import { useState, useRef, useEffect } from 'react';
import { batchPreview, batchUpload, getUsers } from '../api';

// Three steps, deliberately kept separate: picking files, reviewing what
// the parser suggests (fully editable — nothing saved yet), and only then
// actually uploading. batch-preview is called with filenames only; the
// real files never leave the browser until the review is confirmed.
export default function BatchUploadForm({ songId, tracks, onUploaded }) {
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
      getUsers()
        .then(setUsers)
        .catch(() => {});
    }
  }, [step]);

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
      <button onClick={() => setStep('picking')} style={{ marginTop: 6, fontSize: 13 }}>
        + Batch upload
      </button>
    );
  }

  if (step === 'picking') {
    return (
      <div
        style={{ marginTop: 8, fontSize: 14, border: '1px solid #ddd', padding: 10, borderRadius: 6 }}
      >
        <p style={{ margin: '0 0 8px', fontWeight: 500 }}>Batch upload — pick your stem files</p>
        <input
          type="file"
          multiple
          ref={fileInputRef}
          accept=".wav,audio/wav"
          onChange={handleFilesChosen}
        />
        {files.length > 0 && (
          <p style={{ fontSize: 13, color: '#555', margin: '6px 0' }}>
            {files.length} file(s) selected
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <button onClick={handlePreview} disabled={loading}>
            {loading ? 'Checking…' : 'Preview'}
          </button>
          <button onClick={reset} style={{ marginLeft: 6 }}>
            Cancel
          </button>
        </div>
        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div
        style={{ marginTop: 8, fontSize: 13, border: '1px solid #ddd', padding: 10, borderRadius: 6 }}
      >
        <p style={{ margin: '0 0 8px', fontWeight: 500 }}>
          Review before uploading — nothing has been saved yet
        </p>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: 4 }}>File</th>
              <th style={{ padding: 4 }}>Track name</th>
              <th style={{ padding: 4 }}>Target</th>
              <th style={{ padding: 4 }}>Performer</th>
              <th style={{ padding: 4 }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.filename} style={{ borderBottom: '1px solid #eee' }}>
                <td
                  style={{
                    padding: 4,
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.filename}
                >
                  {row.filename}
                </td>
                <td style={{ padding: 4 }}>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    style={{ width: 120, padding: 3 }}
                  />
                </td>
                <td style={{ padding: 4 }}>
                  <select
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
                <td style={{ padding: 4 }}>
                  <select
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
                <td style={{ padding: 4 }}>
                  <input
                    type="text"
                    value={row.note}
                    onChange={(e) => updateRow(i, { note: e.target.value })}
                    style={{ width: 120, padding: 3 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <button onClick={handleConfirmUpload} disabled={loading}>
            {loading ? 'Uploading…' : `Upload ${rows.length} file(s)`}
          </button>
          <button onClick={reset} style={{ marginLeft: 6 }}>
            Cancel
          </button>
        </div>
        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div
        style={{ marginTop: 8, fontSize: 13, border: '1px solid #ddd', padding: 10, borderRadius: 6 }}
      >
        <p style={{ margin: '0 0 8px', fontWeight: 500 }}>Batch upload complete</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {results.results.map((r) => (
            <li key={r.filename} style={{ color: r.error ? 'crimson' : '#2a7' }}>
              {r.filename}
              {r.error
                ? ` — ${r.error}`
                : ` — take ${r.takeNumber}${
                    r.promotedToDefault ? ' (set as default)' : ' (pending promotion)'
                  }`}
            </li>
          ))}
        </ul>
        {results.unfreezeRequestCreated && (
          <p style={{ color: '#854f0b', fontSize: 13, marginTop: 6 }}>
            This song was frozen — an unfreeze request was created.
          </p>
        )}
        <button onClick={reset} style={{ marginTop: 8 }}>
          Close
        </button>
      </div>
    );
  }

  return null;
}

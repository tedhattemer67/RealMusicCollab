import { useEffect, useState, useCallback } from 'react';
import {
  getNotificationChannels,
  createNotificationChannel,
  deleteNotificationChannel,
  testNotificationChannel,
} from '../api';

const CHANNEL_TYPES = ['SLACK', 'DISCORD', 'GENERIC_WEBHOOK'];

function maskUrl(url) {
  try {
    const { hostname } = new URL(url);
    return `${hostname}/••••••••`;
  } catch {
    return '••••••••';
  }
}

// ADMIN-only, per-project notification channel management — collapsed
// behind a toggle like DownloadPanel, since it's a settings surface, not
// something every visit needs open. Only manages this project's own
// channels; instance-wide default channels aren't editable from here (see
// lib/notify.js on the server for how those get used as a fallback).
export default function NotificationChannelsPanel({ projectId }) {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [testResultId, setTestResultId] = useState(null);

  const [type, setType] = useState('SLACK');
  const [label, setLabel] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    getNotificationChannels(projectId)
      .then(setChannels)
      .catch((err) => setError(err.message));
  }, [projectId]);

  useEffect(() => {
    if (open && channels === null) load();
  }, [open, channels, load]);

  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await createNotificationChannel(projectId, {
        type,
        webhookUrl,
        label: label || undefined,
      });
      setLabel('');
      setWebhookUrl('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(channelId) {
    setBusyId(channelId);
    setError(null);
    try {
      await deleteNotificationChannel(channelId);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(channelId) {
    setBusyId(channelId);
    setError(null);
    setTestResultId(null);
    try {
      await testNotificationChannel(channelId);
      setTestResultId(channelId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!open) {
    return (
      <button
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start', paddingInline: 0 }}
        onClick={() => setOpen(true)}
      >
        Notifications
      </button>
    );
  }

  return (
    <div className="card blueprint" style={{ position: 'relative', marginTop: 10, maxWidth: 360 }}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="card-title">Notification channels</span>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {channels === null && <p className="text-muted" style={{ fontSize: 12 }}>Loading…</p>}

      {channels && channels.length === 0 && (
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
          No channels for this project yet — activity falls back to the instance-wide default, if one's set up.
        </p>
      )}

      {channels && channels.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {channels.map((channel) => (
            <li key={channel.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>
                  {channel.label || channel.type} <span className="mono text-muted">({channel.type})</span>
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-secondary"
                    disabled={busyId === channel.id}
                    onClick={() => handleTest(channel.id)}
                  >
                    {busyId === channel.id ? '…' : 'Send test'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={busyId === channel.id}
                    onClick={() => handleDelete(channel.id)}
                  >
                    Delete
                  </button>
                </span>
              </div>
              <span className="mono text-muted" style={{ fontSize: 11 }}>{maskUrl(channel.webhookUrl)}</span>
              {testResultId === channel.id && (
                <span style={{ fontSize: 11, color: 'seagreen' }}>Test sent.</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        <select value={type} onChange={(e) => setType(e.target.value)} className="input">
          {CHANNEL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="input"
          placeholder="Webhook URL"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          required
        />
        <button className="btn btn-primary" disabled={adding}>
          {adding ? 'Adding…' : 'Add channel'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}

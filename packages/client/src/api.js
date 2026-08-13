// Falls back to the relative path that works locally through Vite's dev
// proxy. A real deployment sets VITE_API_BASE_URL at build time, since the
// frontend and backend live on genuinely different URLs once deployed.
const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// credentials: 'include' is required on every request — this is a
// session-cookie app, not a bearer-token one, so the browser needs to be
// told explicitly to send/accept cookies even though the Vite proxy makes
// this look same-origin during development.
async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data;
}

export function login(email, password) {
  return request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function logout() {
  return request('/logout', { method: 'POST' });
}

export function getMe() {
  return request('/me');
}

export function getProjects() {
  return request('/projects');
}

export function createProject(data) {
  return request('/projects', { method: 'POST', body: JSON.stringify(data) });
}

export function createSong(projectId, data) {
  return request(`/projects/${projectId}/songs`, { method: 'POST', body: JSON.stringify(data) });
}

export function getProject(id) {
  return request(`/projects/${id}`);
}

export function getTrackTakes(trackId) {
  return request(`/tracks/${trackId}/takes`);
}

export function getTakeApprovals(takeId) {
  return request(`/takes/${takeId}/approvals`);
}

export function approveTake(takeId) {
  return request(`/takes/${takeId}/approvals`, { method: 'POST' });
}

export function getMixApprovals(mixId) {
  return request(`/mixes/${mixId}/approvals`);
}

export function approveMix(mixId) {
  return request(`/mixes/${mixId}/approvals`, { method: 'POST' });
}

export function getMixes(songId) {
  return request(`/songs/${songId}/mixes`);
}

export async function createMix(songId, formData) {
  const res = await fetch(`${BASE}/songs/${songId}/mixes`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data;
}

export function finalizeMix(mixId) {
  return request(`/mixes/${mixId}/finalize`, { method: 'POST' });
}

export function freezeSong(songId) {
  return request(`/songs/${songId}/freeze`, { method: 'POST' });
}

export function getUnfreezeRequests(songId) {
  return request(`/songs/${songId}/unfreeze-requests`);
}

export function requestUnfreeze(songId, reason) {
  return request(`/songs/${songId}/unfreeze-requests`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function resolveUnfreezeRequest(songId, requestId, approve) {
  return request(`/songs/${songId}/unfreeze-requests/${requestId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ approve }),
  });
}

// One shape covers all four parent types the backend supports — Song,
// Track, Take, and Mix — so the UI doesn't need four near-duplicate sets
// of functions.
const ANNOTATION_PATHS = {
  song: (id) => `/songs/${id}/annotations`,
  track: (id) => `/tracks/${id}/annotations`,
  take: (id) => `/takes/${id}/annotations`,
  mix: (id) => `/mixes/${id}/annotations`,
};

export function getAnnotations(parentType, parentId) {
  return request(ANNOTATION_PATHS[parentType](parentId));
}

export function createAnnotation(parentType, parentId, data) {
  return request(ANNOTATION_PATHS[parentType](parentId), {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

const TODO_PATHS = {
  project: (id) => `/projects/${id}/todos`,
  song: (id) => `/songs/${id}/todos`,
  track: (id) => `/tracks/${id}/todos`,
};

export function getTodos(parentType, parentId) {
  return request(TODO_PATHS[parentType](parentId));
}

export function createTodo(parentType, parentId, data) {
  return request(TODO_PATHS[parentType](parentId), {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateTodoCompletion(todoId, completed) {
  return request(`/todos/${todoId}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed }),
  });
}

export function getUsers() {
  return request('/users');
}

// Downloads return real file bytes (a ZIP), not JSON — read the response as
// a blob and trigger a real browser download via a temporary link, rather
// than the normal fetch-and-render pattern every other function here uses.
async function downloadBlob(path, options, filenameFallback) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  const blob = await res.blob();

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : filenameFallback;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function exportSong(songId, mode) {
  return downloadBlob(
    `/songs/${songId}/export`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    },
    `song-export-${mode}.zip`
  );
}

export function archiveProject(projectId) {
  return downloadBlob(`/projects/${projectId}/archive`, { method: 'POST' }, 'project-archive.zip');
}

export function createInvite(data) {
  return request('/invites', { method: 'POST', body: JSON.stringify(data) });
}

export function previewInvite(token) {
  return request(`/invites/${token}`);
}

export function redeemInvite(token, data) {
  return request(`/invites/${token}/redeem`, { method: 'POST', body: JSON.stringify(data) });
}

// Preview only sends filenames, never the actual files — nothing is saved
// at this step, which is the whole point of it.
export function batchPreview(songId, filenames) {
  return request(`/songs/${songId}/batch-preview`, {
    method: 'POST',
    body: JSON.stringify({ filenames }),
  });
}

export async function batchUpload(songId, formData) {
  const res = await fetch(`${BASE}/songs/${songId}/batch-upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data;
}

// Uploads can't go through request() above — multer needs multipart/form-data,
// and the browser must set that content type (with its boundary) itself when
// given a FormData body, so this deliberately doesn't set Content-Type at all.
export async function uploadTake(trackId, formData) {
  const res = await fetch(`${BASE}/tracks/${trackId}/takes`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data;
}

// Creating a track has the same multipart shape as uploading a take, plus
// a "name" field for the new track itself.
export async function createTrack(songId, formData) {
  const res = await fetch(`${BASE}/songs/${songId}/tracks`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data;
}

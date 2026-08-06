const BASE = '/api';

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

export function getProject(id) {
  return request(`/projects/${id}`);
}

export function getTrackTakes(trackId) {
  return request(`/tracks/${trackId}/takes`);
}

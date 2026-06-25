/**
 * All network calls for CodeRepo go through this module.
 * Components and hooks import from here — never call fetch() directly.
 */

const BASE = '/api'
const TOKEN_KEY = 'auth_token'

function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_KEY)
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  }
}

/**
 * Build the GitHub OAuth authorization URL using Vite env vars.
 * VITE_GITHUB_CLIENT_ID and VITE_OAUTH_REDIRECT_URI must be set in .env.
 */
export function getGitHubAuthUrl() {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GITHUB_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_OAUTH_REDIRECT_URI,
    scope: 'read:user',
  })
  return `https://github.com/login/oauth/authorize?${params}`
}

/**
 * POST /api/auth/github/
 * Exchange a GitHub OAuth code for a DRF token. Stores the token in localStorage.
 * @param {string} code
 * @returns {Promise<{token: string, user: object}>}
 */
export async function exchangeGitHubCode(code) {
  const res = await fetch(`${BASE}/auth/github/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'GitHub auth failed')
  localStorage.setItem(TOKEN_KEY, data.token)
  return data
}

/**
 * GET /api/auth/me/
 * Returns current user info. Throws if token is missing or invalid.
 * @returns {Promise<{username: string, avatar_url: string, github_username: string}>}
 */
export async function getCurrentUser() {
  const res = await fetch(`${BASE}/auth/me/`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    localStorage.removeItem(TOKEN_KEY)
    throw new Error('Not authenticated')
  }
  return res.json()
}

/**
 * POST /api/auth/logout/
 * Invalidates the server-side token and removes it from localStorage.
 */
export async function logout() {
  await fetch(`${BASE}/auth/logout/`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }).catch(() => {})
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * POST /api/ingest/
 * @param {string} githubUrl
 * @returns {Promise<{repo_id: string, status: string, chunk_count: number}>}
 */
export async function ingestRepo(githubUrl) {
  const res = await fetch(`${BASE}/ingest/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ github_url: githubUrl }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Ingestion failed')
  return data
}

/**
 * Open an SSE connection to POST /api/chat/stream/.
 * Returns the raw ReadableStreamDefaultReader over SSE bytes.
 * Prefer using the useSSE hook over calling this directly.
 *
 * @param {string} repoId
 * @param {string} question
 * @returns {Promise<ReadableStreamDefaultReader>}
 */
export async function openChatStream(repoId, question) {
  const res = await fetch(`${BASE}/chat/stream/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ repo_id: repoId, question }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.body.getReader()
}

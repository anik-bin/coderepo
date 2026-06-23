/**
 * All network calls for CodeRepo go through this module.
 * Components and hooks import from here — never call fetch() directly.
 */

const BASE = '/api'

/**
 * POST /api/ingest/
 * @param {string} githubUrl
 * @returns {Promise<{repo_id: string, status: string, chunk_count: number}>}
 */
export async function ingestRepo(githubUrl) {
  const res = await fetch(`${BASE}/ingest/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ github_url: githubUrl }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Ingestion failed')
  return data
}

/**
 * Open an SSE connection to POST /api/chat/stream/.
 * Returns the raw EventSource-like object created via fetch + ReadableStream.
 * Prefer using the useSSE hook over calling this directly.
 *
 * @param {string} repoId
 * @param {string} question
 * @returns {Promise<ReadableStreamDefaultReader>} reader over raw SSE bytes
 */
export async function openChatStream(repoId, question) {
  const res = await fetch(`${BASE}/chat/stream/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_id: repoId, question }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.body.getReader()
}

import { useState, useRef, useCallback } from 'react'
import { openChatStream } from '../api'

/**
 * Custom hook for consuming the /api/chat/stream/ SSE endpoint.
 *
 * Usage:
 *   const { ask, answer, citations, loading, error, reset } = useSSE(repoId)
 *
 * Calls ask(question) to start a stream. Tokens are appended to `answer`
 * as they arrive. `citations` is populated on the final `citations` event.
 */
export function useSSE(repoId) {
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const readerRef = useRef(null)

  const reset = useCallback(() => {
    setAnswer('')
    setCitations([])
    setError(null)
    setLoading(false)
  }, [])

  const ask = useCallback(async (question) => {
    reset()
    setLoading(true)

    let reader
    try {
      reader = await openChatStream(repoId, question)
      readerRef.current = reader
    } catch (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        // The last element may be an incomplete event — keep it in the buffer
        buffer = events.pop()

        for (const raw of events) {
          const parsed = _parseSSEEvent(raw)
          if (!parsed) continue

          if (parsed.event === 'token') {
            setAnswer(prev => prev + (parsed.data?.text ?? ''))
          } else if (parsed.event === 'citations') {
            setCitations(parsed.data?.citations ?? [])
          } else if (parsed.event === 'done') {
            setLoading(false)
          } else if (parsed.event === 'error') {
            setError(parsed.data?.error ?? 'Unknown error')
            setLoading(false)
          }
        }
      }
    } catch (err) {
      // AbortError is expected when the component unmounts mid-stream
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [repoId, reset])

  return { ask, answer, citations, loading, error, reset }
}

/**
 * Parse a single SSE event block (the text between double newlines).
 * Returns { event, data } or null if malformed.
 */
function _parseSSEEvent(raw) {
  const lines = raw.trim().split('\n')
  let event = 'message'
  let dataStr = ''

  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim()
    else if (line.startsWith('data: ')) dataStr = line.slice(6).trim()
  }

  if (!dataStr) return null

  try {
    return { event, data: JSON.parse(dataStr) }
  } catch {
    return null
  }
}

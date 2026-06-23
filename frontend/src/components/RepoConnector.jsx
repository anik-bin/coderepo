import { useState } from 'react'
import { ingestRepo } from '../api'

export function RepoConnector({ onConnected }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('')
  const [chunkCount, setChunkCount] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setStatus('loading')
    setErrorMsg('')
    setChunkCount(null)

    try {
      const data = await ingestRepo(trimmed)
      setChunkCount(data.chunk_count)
      setStatus('idle')
      onConnected(data.repo_id, trimmed)
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  const isLoading = status === 'loading'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">CodeRepo</h1>
          <p className="text-gray-400 text-sm">Connect a GitHub repo and ask questions about the code.</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="github-url" className="block text-sm text-gray-300 mb-1.5">
                GitHub repository URL
              </label>
              <input
                id="github-url"
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={isLoading}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100
                           placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm
                           focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
                           disabled:opacity-50 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                         disabled:cursor-not-allowed text-white font-medium rounded-xl
                         py-2.5 text-sm transition-colors"
            >
              {isLoading ? 'Indexing repo…' : 'Connect repo'}
            </button>
          </form>

          {/* Progress */}
          {isLoading && (
            <div className="mt-5 space-y-2">
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full animate-pulse w-2/3" />
              </div>
              <div className="space-y-1">
                {['Cloning repository…', 'Parsing code with tree-sitter…', 'Embedding chunks…'].map((step, i) => (
                  <p key={i} className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="w-1 h-1 bg-indigo-400 rounded-full animate-pulse shrink-0"
                          style={{ animationDelay: `${i * 200}ms` }} />
                    {step}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <p className="mt-4 text-sm text-red-400 bg-red-950 border border-red-800 rounded-xl px-3 py-2">
              {errorMsg}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">Public repos only for the MVP</p>
      </div>
    </div>
  )
}

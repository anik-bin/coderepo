import { useState, useCallback } from 'react'
import { useSSE } from '../hooks/useSSE'
import { ChatWindow } from '../components/ChatWindow'

export function ChatPage({ repoId, repoUrl, onDisconnect, user, onLogout }) {
  const [messages, setMessages] = useState([])

  const handleComplete = useCallback((finalAnswer, finalCitations) => {
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: finalAnswer, citations: finalCitations },
    ])
  }, [])

  const { ask, answer, citations, loading, error, reset } = useSSE(repoId, {
    onComplete: handleComplete,
  })

  function handleSubmit(question) {
    setMessages(prev => [...prev, { role: 'user', content: question, citations: [] }])
    ask(question)
  }

  const repoName = repoUrl.replace('https://github.com/', '')

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <header className="flex items-center justify-between border-b border-gray-800 px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">CodeRepo</span>
          <span className="text-gray-600 text-xs">·</span>
          <span className="text-indigo-400 text-xs font-mono truncate max-w-[260px]">{repoName}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onDisconnect}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Change repo
          </button>
          {user?.avatar_url && (
            <img
              src={user.avatar_url}
              alt={user.github_username}
              className="w-7 h-7 rounded-full"
            />
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ChatWindow
          messages={messages}
          streamingAnswer={answer}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  )
}

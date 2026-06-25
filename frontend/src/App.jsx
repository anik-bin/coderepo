import { useState, useEffect } from 'react'
import './index.css'
import { RepoConnector } from './components/RepoConnector'
import { ChatPage } from './pages/ChatPage'
import { LoginPage } from './pages/LoginPage'
import { exchangeGitHubCode, getCurrentUser, logout } from './api'

export default function App() {
  // 'loading' while we check auth state on mount
  const [view, setView] = useState('loading')
  const [user, setUser] = useState(null)
  const [repoId, setRepoId] = useState(null)
  const [repoUrl, setRepoUrl] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code) {
      // GitHub redirected back with an OAuth code — exchange it for a token
      window.history.replaceState({}, document.title, '/')
      exchangeGitHubCode(code)
        .then(data => {
          setUser(data.user)
          setView('app')
        })
        .catch(() => setView('login'))
    } else if (localStorage.getItem('auth_token')) {
      // Returning user — verify the stored token is still valid
      getCurrentUser()
        .then(u => {
          setUser(u)
          setView('app')
        })
        .catch(() => setView('login'))
    } else {
      setView('login')
    }
  }, [])

  function handleConnected(id, url) {
    setRepoId(id)
    setRepoUrl(url)
  }

  function handleDisconnect() {
    setRepoId(null)
    setRepoUrl('')
  }

  async function handleLogout() {
    await logout()
    setUser(null)
    setRepoId(null)
    setRepoUrl('')
    setView('login')
  }

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (view === 'login') {
    return <LoginPage />
  }

  if (!repoId) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Minimal header showing who is logged in */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-b border-gray-800">
          {user?.avatar_url && (
            <img
              src={user.avatar_url}
              alt={user.github_username}
              className="w-7 h-7 rounded-full"
            />
          )}
          <span className="text-gray-400 text-xs">{user?.github_username}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Logout
          </button>
        </div>
        <RepoConnector onConnected={handleConnected} />
      </div>
    )
  }

  return (
    <ChatPage
      repoId={repoId}
      repoUrl={repoUrl}
      onDisconnect={handleDisconnect}
      user={user}
      onLogout={handleLogout}
    />
  )
}

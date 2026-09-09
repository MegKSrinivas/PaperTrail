import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  async function handleSuccess(credentialResponse) {
    setError(null)
    try {
      await login(credentialResponse.credential)
      navigate('/library')
    } catch (e) {
      setError(e.message)
    }
  }

  function handleError() {
    setError('Google sign-in failed. Please try again.')
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6 shadow-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">PaperTrail</h1>
          <p className="text-slate-400 mt-2 text-sm">
            AI-powered research &amp; knowledge graph
          </p>
        </div>

        <div className="w-full border-t border-slate-700" />

        <div className="flex flex-col items-center gap-3 w-full">
          <p className="text-slate-400 text-sm">Sign in to continue</p>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            theme="filled_black"
            shape="rectangular"
            size="large"
            width="100%"
          />
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { apiPost } from '../api/client'

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

export default function QueryInterface({ activePaperId, onResult }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function submit(e) {
    e.preventDefault()
    const query = input.trim()
    if (!query || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: query }])
    setLoading(true)

    try {
      const result = await apiPost('/api/research/query', {
        query,
        paper_id: activePaperId || null,
        top_k: 5,
      })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.answer, provider: result.provider, sources: result.sources },
      ])
      onResult?.(result)
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: `Error: ${e.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-slate-400 text-sm">Ask a question about your papers.</p>
              {activePaperId && (
                <p className="text-blue-400 text-xs mt-1">Scoped to selected paper</p>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="bg-blue-700 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] text-sm">
                {msg.content}
              </div>
            ) : msg.role === 'error' ? (
              <div className="bg-red-950 border border-red-800 text-red-300 rounded-2xl px-4 py-2 max-w-[85%] text-sm">
                {msg.content}
              </div>
            ) : (
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm space-y-2">
                <p className="text-white whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <div className="flex items-center gap-2 pt-1 border-t border-slate-700">
                  <span className="text-slate-500 text-xs">via</span>
                  <span className={`text-xs font-medium ${msg.provider?.includes('gemini') ? 'text-blue-400' : 'text-amber-400'}`}>
                    {msg.provider === 'cohere' ? 'Cohere' : 'Gemini (fallback)'}
                  </span>
                  {msg.sources?.length > 0 && (
                    <span className="text-slate-500 text-xs">&middot; {msg.sources.length} sources</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl rounded-tl-sm">
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="p-3 border-t border-slate-800 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activePaperId ? 'Ask about this paper…' : 'Ask across all papers…'}
          disabled={loading}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}

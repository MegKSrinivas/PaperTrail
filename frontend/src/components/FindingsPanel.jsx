export default function FindingsPanel({ result, papers }) {
  if (!result) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-slate-500 text-sm text-center">
          Ask a question in the center panel to see findings here.
        </p>
      </div>
    )
  }

  const { answer, sources, provider } = result

  function getPaperTitle(paperId) {
    const paper = papers?.find((p) => p.id === paperId)
    return paper ? paper.title.replace(/\.pdf$/i, '') : `Paper ${paperId?.slice(0, 8)}…`
  }

  const uniquePaperIds = [...new Set((sources || []).map((s) => s.paper_id))]

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-white font-medium text-sm">Answer</h3>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${provider?.includes('gemini') ? 'bg-blue-900 text-blue-300' : 'bg-amber-900 text-amber-300'}`}>
          {provider === 'cohere' ? 'Cohere' : 'Gemini'}
        </span>
      </div>

      <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
        {answer}
      </p>

      {sources && sources.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wide">
            Sources ({sources.length} chunks from {uniquePaperIds.length} paper{uniquePaperIds.length !== 1 ? 's' : ''})
          </h4>
          {sources.map((src, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-3 space-y-1">
              <p className="text-blue-300 text-xs font-medium truncate">
                {getPaperTitle(src.paper_id)}
              </p>
              <p className="text-slate-400 text-xs leading-relaxed line-clamp-3">
                {src.text}
              </p>
              {src.rerank_score != null && (
                <p className="text-slate-600 text-xs">
                  relevance {(src.rerank_score * 100).toFixed(0)}%
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

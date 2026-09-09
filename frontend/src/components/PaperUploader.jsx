import { useRef, useState } from 'react'
import { apiPostForm } from '../api/client'

export default function PaperUploader({ onUploaded }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState(null)

  async function uploadFile(file) {
    if (!file?.name.toLowerCase().endsWith('.pdf')) {
      setStatus({ type: 'error', msg: 'Only PDF files are supported.' })
      return
    }
    setUploading(true)
    setStatus(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const result = await apiPostForm('/api/papers/upload', form)
      setStatus({ type: 'success', msg: `"${result.title.replace(/\.pdf$/i, '')}" ingested (${result.ingestion_status}).` })
      onUploaded?.()
    } catch (e) {
      setStatus({ type: 'error', msg: e.message })
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  return (
    <div className="p-3 border-t border-slate-800">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-950/30'
            : 'border-slate-700 hover:border-slate-500'
        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files[0]; if (f) uploadFile(f); e.target.value = '' }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-xs">Ingesting… this takes 30–60 s</p>
          </div>
        ) : (
          <>
            <p className="text-slate-300 text-sm font-medium">Drop PDF here</p>
            <p className="text-slate-500 text-xs mt-1">or click to browse</p>
          </>
        )}
      </div>

      {status && (
        <p className={`mt-2 text-xs ${status.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
          {status.msg}
        </p>
      )}
      <p className="text-slate-600 text-xs mt-1">Ingestion runs synchronously (30–60 s).</p>
    </div>
  )
}

import { useState } from 'react'
import useSWR from 'swr'
import { apiGet, apiPost, apiPostForm } from '../api/client'

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('papertrail_token')
  const headers = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) { window.location.href = '/'; throw new Error('Session expired') }
  if (res.status === 204) return null
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail || `Error ${res.status}`) }
  return res.json()
}

async function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' })
}

async function apiPatch(path, body) {
  return apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export default function GroupsPage() {
  const { data: groups, mutate: mutateGroups } = useSWR('/api/groups/', apiGet)
  const { data: papersData } = useSWR('/api/papers/', apiGet)
  const papers = papersData || []
  const allGroups = groups || []

  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingName, setEditingName] = useState(null)
  const [editNameVal, setEditNameVal] = useState('')

  const selectedGroup = allGroups.find((g) => g.id === selectedGroupId)
  const groupPaperIds = new Set(selectedGroup?.paper_ids || [])
  const inGroup = papers.filter((p) => groupPaperIds.has(p.id))
  const notInGroup = papers.filter((p) => !groupPaperIds.has(p.id))

  async function createGroup(e) {
    e.preventDefault()
    if (!newGroupName.trim()) return
    setCreating(true)
    try {
      const g = await apiPost('/api/groups/', { name: newGroupName.trim() })
      await mutateGroups()
      setSelectedGroupId(g.id)
      setNewGroupName('')
    } finally {
      setCreating(false)
    }
  }

  async function deleteGroup(id) {
    await apiDelete(`/api/groups/${id}`)
    if (selectedGroupId === id) setSelectedGroupId(null)
    await mutateGroups()
  }

  async function saveRename(id) {
    if (!editNameVal.trim()) return
    await apiPatch(`/api/groups/${id}`, { name: editNameVal.trim() })
    setEditingName(null)
    await mutateGroups()
  }

  async function addPaper(paperId) {
    await apiPost(`/api/groups/${selectedGroupId}/papers`, { paper_id: paperId })
    await mutateGroups()
  }

  async function removePaper(paperId) {
    await apiDelete(`/api/groups/${selectedGroupId}/papers/${paperId}`)
    await mutateGroups()
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: group list */}
      <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-800">
          <h1 className="text-white font-semibold text-lg">Groups</h1>
          <p className="text-slate-400 text-xs mt-0.5">Organize papers for graph views</p>
        </div>

        <ul className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {allGroups.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => setSelectedGroupId(g.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group ${
                  selectedGroupId === g.id
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {editingName === g.id ? (
                  <input
                    autoFocus
                    value={editNameVal}
                    onChange={(e) => setEditNameVal(e.target.value)}
                    onBlur={() => saveRename(g.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(g.id); if (e.key === 'Escape') setEditingName(null) }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-slate-700 text-white text-sm px-1 rounded w-full"
                  />
                ) : (
                  <>
                    <span className="truncate">{g.name}</span>
                    <span className="text-slate-600 text-xs shrink-0 ml-1">{g.paper_ids.length}</span>
                  </>
                )}
              </button>
              {selectedGroupId === g.id && editingName !== g.id && (
                <div className="flex gap-1 px-3 pb-1">
                  <button
                    onClick={() => { setEditingName(g.id); setEditNameVal(g.name) }}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    Rename
                  </button>
                  <span className="text-slate-700">·</span>
                  <button
                    onClick={() => deleteGroup(g.id)}
                    className="text-red-500 hover:text-red-400 text-xs"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
          {allGroups.length === 0 && (
            <li className="px-3 py-4 text-slate-600 text-xs text-center">No groups yet</li>
          )}
        </ul>

        <form onSubmit={createGroup} className="p-3 border-t border-slate-800 flex gap-2">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New group name…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={creating || !newGroupName.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs px-2 py-1.5 rounded-lg"
          >
            Create
          </button>
        </form>
      </div>

      {/* Right: paper assignment */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!selectedGroup ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-slate-500 text-sm">Select a group to manage its papers</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-slate-800 shrink-0">
              <h2 className="text-white font-semibold">{selectedGroup.name}</h2>
              <p className="text-slate-400 text-sm mt-0.5">{inGroup.length} paper{inGroup.length !== 1 ? 's' : ''} in this group</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-4 space-y-6">

                {/* Papers in group */}
                <div>
                  <h3 className="text-slate-300 text-sm font-medium mb-2">In this group</h3>
                  {inGroup.length === 0 ? (
                    <p className="text-slate-600 text-sm">No papers yet — add from below.</p>
                  ) : (
                    <ul className="space-y-2">
                      {inGroup.map((p) => (
                        <li key={p.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="text-white text-sm truncate">{p.title.replace(/\.pdf$/i, '')}</p>
                            {p.authors?.length > 0 && (
                              <p className="text-slate-500 text-xs truncate">
                                {p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removePaper(p.id)}
                            className="shrink-0 ml-3 text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Papers not in group */}
                {notInGroup.length > 0 && (
                  <div>
                    <h3 className="text-slate-300 text-sm font-medium mb-2">Add papers</h3>
                    <ul className="space-y-2">
                      {notInGroup.map((p) => (
                        <li key={p.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="text-slate-300 text-sm truncate">{p.title.replace(/\.pdf$/i, '')}</p>
                            {p.authors?.length > 0 && (
                              <p className="text-slate-600 text-xs truncate">
                                {p.authors.slice(0, 2).join(', ')}{p.authors.length > 2 ? ' et al.' : ''}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => addPaper(p.id)}
                            className="shrink-0 ml-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            + Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

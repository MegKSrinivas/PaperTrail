function getToken() {
  return localStorage.getItem('papertrail_token')
}

function handle401() {
  localStorage.removeItem('papertrail_token')
  localStorage.removeItem('papertrail_user')
  window.location.href = '/'
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401) {
    handle401()
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }

  return res.json()
}

export function apiGet(path) {
  return request(path)
}

export function apiPost(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiPostForm(path, formData) {
  return request(path, {
    method: 'POST',
    body: formData,
  })
}

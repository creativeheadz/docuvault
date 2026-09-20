import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * One refresh at a time.
 *
 * Every page fires several queries at once, so when the access token expires
 * they all get a 401 within the same few milliseconds. Refreshing per request
 * meant each of them posted the *same* refresh token: the first rotated it and
 * the rest arrived holding a token that had already been used, which the server
 * correctly reads as two parties holding one credential - and ends every
 * session. The user lands back on the login screen roughly every fifteen
 * minutes, for no reason they can see.
 *
 * So the first 401 starts the refresh and the others wait on the same promise.
 */
let refreshInFlight: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) return Promise.reject(new Error('No refresh token'))

    refreshInFlight = axios
      .post('/api/v1/auth/refresh', { refresh_token: refreshToken })
      .then((res) => {
        const { access_token, refresh_token } = res.data
        localStorage.setItem('access_token', access_token)
        localStorage.setItem('refresh_token', refresh_token)
        return access_token as string
      })
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

/** Redirect once, however many requests failed together. */
let signingOut = false

function signOut() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  if (!signingOut) {
    signingOut = true
    window.location.href = '/login'
  }
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      try {
        const accessToken = await refreshAccessToken()
        original.headers.Authorization = `Bearer ${accessToken}`
        return client(original)
      } catch {
        signOut()
      }
    }
    return Promise.reject(error)
  }
)

export default client

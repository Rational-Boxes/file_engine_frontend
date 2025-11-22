// utils/jwt.ts
export const decodeToken = (token: string) => {
  try {
    const [header, payload, signature] = token.split('.')
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decodedPayload)
  } catch (error) {
    console.error('Error decoding token:', error)
    return null
  }
}

export const isTokenExpired = (token: string) => {
  const decoded = decodeToken(token)
  if (!decoded || !decoded.exp) {
    return true
  }
  return Date.now() >= decoded.exp * 1000
}

export const getTokenExpiration = (token: string) => {
  const decoded = decodeToken(token)
  if (!decoded || !decoded.exp) {
    return null
  }
  return new Date(decoded.exp * 1000)
}

export const getTimeUntilExpiration = (token: string) => {
  const expiration = getTokenExpiration(token)
  if (!expiration) return 0
  return expiration.getTime() - Date.now()
}

export const shouldRefreshToken = (token: string, bufferSeconds = 300) => {
  const timeUntilExpiration = getTimeUntilExpiration(token)
  return timeUntilExpiration < bufferSeconds * 1000
}
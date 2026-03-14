// Only imports from aws-amplify/auth (no @aws-amplify/ui-react) — portable to React Native.
import { useState, useEffect } from 'react'
import { getCurrentUser, fetchUserAttributes, signOut, type AuthUser } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'

interface UseAuthReturn {
  user: AuthUser | null
  email: string | undefined
  isLoading: boolean
  signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [email, setEmail] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([getCurrentUser(), fetchUserAttributes()])
      .then(([authUser, attrs]) => {
        setUser(authUser)
        setEmail(attrs.email)
      })
      .catch(() => {
        setUser(null)
        setEmail(undefined)
      })
      .finally(() => setIsLoading(false))

    // Handle OAuth redirect callback (e.g. Sign in with Google)
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        Promise.all([getCurrentUser(), fetchUserAttributes()])
          .then(([authUser, attrs]) => {
            setUser(authUser)
            setEmail(attrs.email)
            setIsLoading(false)
          })
          .catch(() => {})
      } else if (payload.event === 'signedOut') {
        setUser(null)
        setEmail(undefined)
      }
    })
    return unsubscribe
  }, [])

  const handleSignOut = async () => {
    await signOut()
    sessionStorage.clear()
    setUser(null)
    setEmail(undefined)
  }

  return { user, email, isLoading, signOut: handleSignOut }
}

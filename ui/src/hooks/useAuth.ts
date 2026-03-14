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
    // If the URL contains ?code=, Amplify is mid-way through exchanging the OAuth code
    // for tokens. getCurrentUser() would fail at this point, causing AuthGuard to
    // redirect to /login before auth completes. Keep isLoading: true and wait for the
    // Hub signedIn event instead.
    const isOAuthCallback = new URLSearchParams(window.location.search).has('code')

    if (!isOAuthCallback) {
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
    }

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        Promise.all([getCurrentUser(), fetchUserAttributes()])
          .then(([authUser, attrs]) => {
            setUser(authUser)
            setEmail(attrs.email)
            setIsLoading(false)
          })
          .catch(() => setIsLoading(false))
      } else if (payload.event === 'signedOut') {
        setUser(null)
        setEmail(undefined)
      } else if (payload.event === 'signInWithRedirect_failure') {
        setIsLoading(false)
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

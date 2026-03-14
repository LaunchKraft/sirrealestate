// Only imports from aws-amplify/auth (no @aws-amplify/ui-react) — portable to React Native.
import { useState, useEffect } from 'react'
import { getCurrentUser, fetchUserAttributes, signOut, type AuthUser } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { OAUTH_IN_PROGRESS_KEY } from '@/components/auth/GoogleSignInButton'

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
    // If GoogleSignInButton set this flag, we're mid-way through the OAuth code exchange.
    // getCurrentUser() would fail at this point (tokens not yet stored), causing AuthGuard
    // to redirect to /login before auth completes. Keep isLoading: true and wait for the
    // Hub signedIn event instead.
    // Note: we cannot rely on ?code= in the URL because the React Router wildcard route
    // (<Navigate to="/chat">) strips query params before useAuth runs on the /chat route.
    const isOAuthCallback = sessionStorage.getItem(OAUTH_IN_PROGRESS_KEY) === '1'

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
        sessionStorage.removeItem(OAUTH_IN_PROGRESS_KEY)
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
        sessionStorage.removeItem(OAUTH_IN_PROGRESS_KEY)
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

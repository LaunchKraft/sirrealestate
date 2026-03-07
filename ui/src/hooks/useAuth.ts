// Only imports from aws-amplify/auth (no @aws-amplify/ui-react) — portable to React Native.
import { useState, useEffect } from 'react'
import { getCurrentUser, fetchUserAttributes, signOut, type AuthUser } from 'aws-amplify/auth'

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
  }, [])

  const handleSignOut = async () => {
    await signOut()
    sessionStorage.clear()
    setUser(null)
    setEmail(undefined)
  }

  return { user, email, isLoading, signOut: handleSignOut }
}

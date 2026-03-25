import { createContext, type PropsWithChildren, useContext, useRef, useCallback, useState } from 'react'

type RefreshFn = () => void
// Register returns an unsubscribe so components can clean up on unmount.
type RegisterFn = (fn: RefreshFn) => () => void

type SidebarRefreshContextType = {
  invalidateProfile: () => void
  invalidateSearchResults: () => void
  invalidateDocuments: () => void
  invalidateOffers: () => void
  invalidateViewings: () => void
  invalidateClosings: () => void
  registerProfileRefetch: RegisterFn
  registerSearchResultsRefetch: RegisterFn
  registerDocumentsRefetch: RegisterFn
  registerOffersRefetch: RegisterFn
  registerViewingsRefetch: RegisterFn
  registerClosingsRefetch: RegisterFn
  newListingsCount: number
  setNewListingsCount: (n: number) => void
}

const SidebarRefreshContext = createContext<SidebarRefreshContextType | null>(null)

export function SidebarRefreshProvider({ children }: PropsWithChildren) {
  // Each type holds a Set of listeners so multiple components can register.
  const profileListeners = useRef<Set<RefreshFn>>(new Set())
  const searchResultsListeners = useRef<Set<RefreshFn>>(new Set())
  const documentsListeners = useRef<Set<RefreshFn>>(new Set())
  const offersListeners = useRef<Set<RefreshFn>>(new Set())
  const viewingsListeners = useRef<Set<RefreshFn>>(new Set())
  const closingsListeners = useRef<Set<RefreshFn>>(new Set())
  const [newListingsCount, setNewListingsCount] = useState(0)

  const invalidateProfile = useCallback(() => { profileListeners.current.forEach(fn => fn()) }, [])
  const invalidateSearchResults = useCallback(() => { searchResultsListeners.current.forEach(fn => fn()) }, [])
  const invalidateDocuments = useCallback(() => { documentsListeners.current.forEach(fn => fn()) }, [])
  const invalidateOffers = useCallback(() => { offersListeners.current.forEach(fn => fn()) }, [])
  const invalidateViewings = useCallback(() => { viewingsListeners.current.forEach(fn => fn()) }, [])
  const invalidateClosings = useCallback(() => { closingsListeners.current.forEach(fn => fn()) }, [])

  const registerProfileRefetch = useCallback<RegisterFn>((fn) => { profileListeners.current.add(fn); return () => profileListeners.current.delete(fn) }, [])
  const registerSearchResultsRefetch = useCallback<RegisterFn>((fn) => { searchResultsListeners.current.add(fn); return () => searchResultsListeners.current.delete(fn) }, [])
  const registerDocumentsRefetch = useCallback<RegisterFn>((fn) => { documentsListeners.current.add(fn); return () => documentsListeners.current.delete(fn) }, [])
  const registerOffersRefetch = useCallback<RegisterFn>((fn) => { offersListeners.current.add(fn); return () => offersListeners.current.delete(fn) }, [])
  const registerViewingsRefetch = useCallback<RegisterFn>((fn) => { viewingsListeners.current.add(fn); return () => viewingsListeners.current.delete(fn) }, [])
  const registerClosingsRefetch = useCallback<RegisterFn>((fn) => { closingsListeners.current.add(fn); return () => closingsListeners.current.delete(fn) }, [])

  return (
    <SidebarRefreshContext.Provider
      value={{
        invalidateProfile,
        invalidateSearchResults,
        invalidateDocuments,
        invalidateOffers,
        invalidateViewings,
        invalidateClosings,
        registerProfileRefetch,
        registerSearchResultsRefetch,
        registerDocumentsRefetch,
        registerOffersRefetch,
        registerViewingsRefetch,
        registerClosingsRefetch,
        newListingsCount,
        setNewListingsCount,
      }}
    >
      {children}
    </SidebarRefreshContext.Provider>
  )
}

export function useSidebarRefresh() {
  const ctx = useContext(SidebarRefreshContext)
  if (!ctx) throw new Error('useSidebarRefresh must be used within SidebarRefreshProvider')
  return ctx
}

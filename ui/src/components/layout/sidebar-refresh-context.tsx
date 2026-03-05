import { createContext, type PropsWithChildren, useContext, useRef, useCallback } from 'react'

type RefreshFn = () => void

type SidebarRefreshContextType = {
  invalidateProfile: () => void
  invalidateSearchResults: () => void
  invalidateDocuments: () => void
  invalidateOffers: () => void
  registerProfileRefetch: (fn: RefreshFn) => void
  registerSearchResultsRefetch: (fn: RefreshFn) => void
  registerDocumentsRefetch: (fn: RefreshFn) => void
  registerOffersRefetch: (fn: RefreshFn) => void
}

const SidebarRefreshContext = createContext<SidebarRefreshContextType | null>(null)

export function SidebarRefreshProvider({ children }: PropsWithChildren) {
  const profileRefetchRef = useRef<RefreshFn | null>(null)
  const searchResultsRefetchRef = useRef<RefreshFn | null>(null)
  const documentsRefetchRef = useRef<RefreshFn | null>(null)
  const offersRefetchRef = useRef<RefreshFn | null>(null)

  const invalidateProfile = useCallback(() => { profileRefetchRef.current?.() }, [])
  const invalidateSearchResults = useCallback(() => { searchResultsRefetchRef.current?.() }, [])
  const invalidateDocuments = useCallback(() => { documentsRefetchRef.current?.() }, [])
  const invalidateOffers = useCallback(() => { offersRefetchRef.current?.() }, [])

  const registerProfileRefetch = useCallback((fn: RefreshFn) => { profileRefetchRef.current = fn }, [])
  const registerSearchResultsRefetch = useCallback((fn: RefreshFn) => { searchResultsRefetchRef.current = fn }, [])
  const registerDocumentsRefetch = useCallback((fn: RefreshFn) => { documentsRefetchRef.current = fn }, [])
  const registerOffersRefetch = useCallback((fn: RefreshFn) => { offersRefetchRef.current = fn }, [])

  return (
    <SidebarRefreshContext.Provider
      value={{
        invalidateProfile,
        invalidateSearchResults,
        invalidateDocuments,
        invalidateOffers,
        registerProfileRefetch,
        registerSearchResultsRefetch,
        registerDocumentsRefetch,
        registerOffersRefetch,
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

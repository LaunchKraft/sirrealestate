import '@/style/global.css'

import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import LayoutContextProvider from '@/components/layout/layout-context'
import { SidebarRefreshProvider } from '@/components/layout/sidebar-refresh-context'
import { FloatingChatProvider } from '@/components/chat/floating-chat-context'
import { FavoritesProvider } from '@/components/favorites/FavoritesContext'
import Header from '@/components/layout/containers/header'
import Main from '@/components/layout/containers/main'
import ContentWrapper from '@/components/layout/containers/content-wrapper'
import LeftMenu from '@/components/layout/menu/left-menu'
import MenuBackdrop from '@/components/layout/menu/menu-backdrop'
import FloatingChat from '@/components/chat/FloatingChat'

function AppLayoutInner() {
  const { pathname, search } = useLocation()

  useEffect(() => { window.scrollTo(0, 0) }, [pathname, search])

  return (
    <FloatingChatProvider>
      <Header />
      <LeftMenu />
      <Main>
        <ContentWrapper>
          <Outlet />
        </ContentWrapper>
      </Main>
      <FloatingChat />
      <MenuBackdrop />
    </FloatingChatProvider>
  )
}

export default function AppLayout() {
  return (
    <LayoutContextProvider>
      <SidebarRefreshProvider>
        <FavoritesProvider>
          <AppLayoutInner />
        </FavoritesProvider>
      </SidebarRefreshProvider>
    </LayoutContextProvider>
  )
}

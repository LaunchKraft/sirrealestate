import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { trackPageView } from '@/lib/analytics'

function RouteTracker() {
  const { pathname, search } = useLocation()
  useEffect(() => { trackPageView(pathname + search) }, [pathname, search])
  return null
}
import AuthGuard from '@/components/auth/AuthGuard'
import AppLayout from '@/components/layout/AppLayout'
import ChatPage from '@/pages/ChatPage'
import ListingsPage from '@/pages/ListingsPage'
import ViewingsPage from '@/pages/ViewingsPage'
import LoginPage from '@/pages/LoginPage'
import SignUpPage from '@/pages/SignUpPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ViewingResponsePage from '@/pages/ViewingResponsePage'
import SellerResponsePage from '@/pages/SellerResponsePage'
import NotificationsPage from '@/pages/NotificationsPage'
import FavoritesPage from '@/pages/FavoritesPage'

export default function App() {
  return (
    <BrowserRouter>
      <RouteTracker />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/viewing-response" element={<ViewingResponsePage />} />
        <Route path="/seller-response" element={<SellerResponsePage />} />
        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/listings/:profileId" element={<ListingsPage />} />
          <Route path="/viewings" element={<ViewingsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

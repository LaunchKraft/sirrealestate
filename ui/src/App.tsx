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
import BetaSignUpPage from '@/pages/BetaSignUpPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ViewingResponsePage from '@/pages/ViewingResponsePage'
import SellerResponsePage from '@/pages/SellerResponsePage'
import NotificationsPage from '@/pages/NotificationsPage'
import FavoritesPage from '@/pages/FavoritesPage'
import DashboardPage from '@/pages/DashboardPage'
import DocumentsPage from '@/pages/DocumentsPage'
import IconGalleryPage from '@/pages/IconGalleryPage'
import OfferDetailPage from '@/pages/offers/OfferDetailPage'
import ClosingDetailPage from '@/pages/closings/ClosingDetailPage'

// The beta waitlist signup lives on the marketing site.
function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to) }, [to])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteTracker />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sign-up" element={<ExternalRedirect to="https://sirrealtor.com/#signup" />} />
        <Route path="/sign-up-internal" element={<SignUpPage />} />
        <Route path="/beta-signup" element={<BetaSignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/viewing-response" element={<ViewingResponsePage />} />
        <Route path="/seller-response" element={<SellerResponsePage />} />
        <Route path="/icons" element={<IconGalleryPage />} />
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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/offers/:offerId" element={<OfferDetailPage />} />
          <Route path="/closings/:closingId" element={<ClosingDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { DataProvider } from './contexts/DataContext';
import ColorSystemProvider from './components/ColorSystemProvider';
import NavBar from './components/NavBar';
import { useAppInitialization } from './hooks/useAppInitialization';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import Analyse from './utils/Analyse';
import { useRoutePreloader } from './hooks/useRoutePreloader';
import PageSkeleton from './components/PageSkeletonProgressive';
import SEO from './components/SEO';

// ─── Lazy-loaded: keep heavy components off the critical path ───────────────
const Footer = lazy(() => import('./components/Footer'));
const ContentManagementPanel = lazy(() => import('./components/ContentManagementPanel'));
const GoogleOneTapPrompt = lazy(() => import('./components/GoogleOneTapPrompt'));

const HomePage = lazy(() => import('./pages/HomePage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const BookingSuccessPage = lazy(() => import('./pages/BookingSuccessPage'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const LoginPage = lazy(() => import('./pages/Login'));
const RatingsPage = lazy(() => import('./pages/RatingsPage'));
const UpdatePasswordPage = lazy(() => import('./pages/UpdatePasswordPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const CoverageAreasPage = lazy(() => import('./pages/CoverageAreasPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const EmailConfirmedPage = lazy(() => import('./pages/EmailConfirmedPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const RateBookingPage = lazy(() => import('./pages/RateBookingPage'));
const UnsubscribePage = lazy(() => import('./pages/UnsubscribePage'));
const BuyCreditsPage = lazy(() => import('./pages/BuyCreditsPage'));
const DonationPage = lazy(() => import('./pages/DonationPage'));
const SimpleRequestPage = lazy(() => import('./pages/SimpleRequestPage'));
const MerchandisePage = lazy(() => import('./pages/MerchandisePage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const DriveDownload = lazy(() => import('./components/DriveDownload'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const PanoramaViewerPage = lazy(() => import('./pages/PanoramaViewerPage'));
const PreviewPage = lazy(() => import('./pages/PreviewPage'));

// Create this helper function/component near your App component
function PreviewRedirectHandler() {
  const { id } = useParams();
  
  // Map old preview IDs to their target destination
  const redirectMap = {
    "3905659f-ba2e-4ade-89e9-993e32cb761c": "/preview/2b0cf0ad-59bc-4b26-b0de-fe82bbc27afb",
    "2b0cf0ad-59bc-4b26-b0de-fe82bbc27afb": "/preview/434448bc-fb67-4dc6-ac59-1b76b2b78153"
  };

  if (redirectMap[id]) {
    return <Navigate to={redirectMap[id]} replace />;
  }

  return <PreviewPage />;
}

function AppContent() {
  useRoutePreloader();

  return (
    <>
      <ScrollToTop />

      {/* /panorama is a fully standalone page — no NavBar, Footer, or chrome */}
      <Routes>
        <Route path="/panorama" element={
          <Suspense fallback={null}><PanoramaViewerPage /></Suspense>
        } />
        <Route path="/preview/:id" element={
          <Suspense fallback={null}><PreviewPage /></Suspense>
        } />

       {/* Single catch-all handler for preview IDs that checks against old mappings */}
        <Route path="/preview/:id" element={
          <Suspense fallback={null}><PreviewRedirectHandler /></Suspense>
        } />

        {/* All other routes get the full site shell */}
        <Route path="*" element={<SiteShell />} />
      </Routes>
    </>
  );
}

function SiteShell() {
  return (
    <>
      {/* Default SEO: resets title/meta on every navigation for pages that
          don't render their own <SEO /> component. Individual page <SEO />
          components always run after this one and override as needed. */}
      <SEO />
      <NavBar />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/product/:name" element={<ProductPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/update-password" element={<UpdatePasswordPage />} />
          <Route path="/email-confirmed" element={<EmailConfirmedPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/coverage" element={<CoverageAreasPage />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          <Route path="/simple-request" element={<SimpleRequestPage />} />

          {/*
            Merchandise — ALL /merch/* routes go to MerchandisePage.
            The page itself reads the URL and either scrolls to a product
            (/:name), scrolls to cart (/cart), or opens checkout (/cart/checkout).
            MerchProductPage is no longer used for routing — it's accessed
            via the "Læs mere" link which stays as /merch/:name → same page scroll.
          */}
          <Route path="/merch" element={<MerchandisePage />} />
          <Route path="/merch/checkout" element={<MerchandisePage />} />

          <Route path="/donate/:linkId" element={<DonationPage />} />
          <Route path="/rate-booking/:token" element={<RateBookingPage />} />
          <Route path="/booking/:productId" element={<BookingPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/booking-success" element={<BookingSuccessPage />} />
          <Route path="/ratings" element={<RatingsPage />} />
          <Route path="/file/gdrive/:id" element={<DriveDownload />} />
<Route path="/file/gdrive/1aGBpYj4Sv9oN8aVcw0Us0uocU-fpPTXn" element={<Navigate to="/file/gdrive/1vLSWbe2v8Lg-W4-Bw6igHR-TYnxlE3qG" replace />} />
          

          <Route path="/profile" element={
            <ProtectedRoute><ProfilePage /></ProtectedRoute>
          } />

          <Route path="/admin" element={
            <ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>
          } />
          <Route path="/admin/:section" element={
            <ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>
          } />

          <Route path="/finance" element={
            <ProtectedRoute requireAdmin><FinancePage /></ProtectedRoute>
          } />

          <Route path="/buy-credits" element={
            <ProtectedRoute><BuyCreditsPage /></ProtectedRoute>
          } />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
      <Toaster />
      <Suspense fallback={null}>
        <GoogleOneTapPrompt />
      </Suspense>
    </>
  );
}

function InitializedApp() {
  useAppInitialization();
  return (
    <ColorSystemProvider>
      <Analyse />
      <Suspense fallback={null}>
        <ContentManagementPanel />
      </Suspense>
      <AppContent />
    </ColorSystemProvider>
  );
}

function App() {
  return (
    <Router>
      <LoadingProvider>
        <AuthProvider>
          <DataProvider>
            <InitializedApp />
          </DataProvider>
        </AuthProvider>
      </LoadingProvider>
    </Router>
  );
}

export default App;

import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Package,
  Image,
  MapPin,
  Home,
  Clock,
  Mail,
  FileImage,
  Wallet,
  Video,
  Search,
  Users,
  GitBranch,
  Globe,
  ShoppingBag,
  ScanLine,
  Building2,
  Link2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import EditableContent from '../components/EditableContent';
import ErrorBoundary from '../components/ErrorBoundary';
import HomeSectionsManager from '../components/HomeSectionsManager';
import ProductsManager from '../components/admin/ProductsManager';
import PortfolioManager from '../components/admin/PortfolioManager';
import ClientLogosManager from '../components/admin/ClientLogosManager';
import AddressZonesManager from '../components/admin/AddressZonesManager';
import BookingsManager from '../components/admin/BookingsManager';
import NewsletterManager from '../components/admin/NewsletterManager';
import BookingConfigManager from '../components/admin/BookingConfigManager';
import ExternalImagesManager from '../components/admin/ExternalImagesManager';
import DonationsManager from '../components/admin/DonationsManager';
import VideoManager from '../components/admin/VideoManager';
import MeilisearchManager from '../components/admin/MeilisearchManager';
import AdminUsersPanel from '../components/admin/AdminUsersPanel';
import DeployContentManager from '../components/admin/DeployContentManager';
import SeoDocumentsManager from '../components/admin/SeoDocumentsManager';
import ShopManager from '../components/admin/ShopManager';
import Preview360Manager from '../components/admin/Preview360Manager';
import PreviewLinksManager from '../components/admin/PreviewLinksManager';

type TabId =
  | 'bookings'
  | 'booking-config'
  | 'products'
  | 'portfolio'
  | 'client-logos'
  | 'zones'
  | 'home-sections'
  | 'newsletter'
  | 'external-images'
  | 'donations'
  | 'video'
  | 'meilisearch'
  | 'users'
  | 'deploy'
  | 'seo-documents'
  | 'shop'
  | 'preview-360'
  | 'preview-links';

const VALID_SECTIONS = new Set<TabId>([
  'bookings', 'booking-config', 'products', 'portfolio', 'client-logos',
  'zones', 'home-sections', 'newsletter',
  'external-images', 'donations', 'video', 'meilisearch', 'users', 'deploy',
  'seo-documents', 'shop', 'preview-360', 'preview-links',
]);

const DEFAULT_TAB: TabId = 'bookings';

const AdminPage: React.FC = () => {
  const { isAdmin, loading, profileLoading } = useAuth();
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  const {
    products, portfolioImages, addressZones, bookings,
    refreshProducts, refreshPortfolio, refreshBundles, refreshBookings,
    refreshNewsletters, refreshNewsletterSubscribers, refreshNewsletterTemplates,
    refreshAddressZones, refreshClientLogos,
    isProductsLoaded, isPortfolioLoaded, isBookingsLoaded,
    isNewslettersLoaded, isNewsletterSubscribersLoaded, isNewsletterTemplatesLoaded,
    isAddressZonesLoaded, isClientLogosLoaded,
  } = useData();

  const activeTab: TabId =
    section && VALID_SECTIONS.has(section as TabId)
      ? (section as TabId)
      : DEFAULT_TAB;

  useEffect(() => {
    // Don't redirect while auth is still loading — wait until we know the user's state
    if (loading || profileLoading) return;
    // Don't redirect if not admin — the !isAdmin block below will handle rendering
    if (!isAdmin) return;

    if (!section) {
      navigate(`/admin/${DEFAULT_TAB}`, { replace: true });
    } else if (!VALID_SECTIONS.has(section as TabId)) {
      navigate(`/admin/${DEFAULT_TAB}`, { replace: true });
    }
  }, [section, navigate, loading, profileLoading, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!isProductsLoaded) refreshProducts();
    if (!isPortfolioLoaded) { refreshPortfolio(); refreshBundles(); }
    if (!isBookingsLoaded) refreshBookings();
    if (!isNewslettersLoaded) refreshNewsletters();
    if (!isNewsletterSubscribersLoaded) refreshNewsletterSubscribers();
    if (!isNewsletterTemplatesLoaded) refreshNewsletterTemplates();
    if (!isAddressZonesLoaded) refreshAddressZones();
    if (!isClientLogosLoaded) refreshClientLogos();
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show spinner while auth is resolving — never evaluate isAdmin before this is done
  if (loading || profileLoading) {
    return (
      <div className="pt-24 pb-16 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-neutral-400">
          <div className="w-10 h-10 border-4 border-neutral-600 border-t-primary rounded-full animate-spin" />
          <span className="text-sm"><EditableContent contentKey="admin-page-checker-adgang" fallback="Checker adgang…" /></span>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="pt-24 pb-16 min-h-screen">
        <div className="container max-w-md mx-auto">
          <div className="bg-neutral-800 rounded-xl shadow-md p-8 text-center">
            <EditableContent
              contentKey="admin-access-denied-title"
              as="h1"
              className="text-2xl font-bold mb-4"
              fallback="Adgang nægtet"
            />
            <EditableContent
              contentKey="admin-access-denied-message"
              as="p"
              className="text-neutral-400"
              fallback="Du har ikke tilladelse til at se denne side."
            />
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'bookings',        label: 'Bookinger',              icon: Calendar  },
    { id: 'booking-config',  label: 'Ugentlige tilgængligheder', icon: Clock  },
    { id: 'products',        label: 'Produkter',              icon: Package   },
    { id: 'portfolio',       label: 'Portfolio',              icon: Image     },
    { id: 'client-logos',    label: 'Kunde Logoer',           icon: Building2 },
    { id: 'external-images', label: 'Eksterne Billeder',      icon: FileImage },
    { id: 'zones',           label: 'Adressezoner',           icon: MapPin    },
    { id: 'donations',       label: 'Betalinger',             icon: Wallet    },
    { id: 'newsletter',      label: 'Nyhedsbreve',            icon: Mail      },
    { id: 'video',           label: 'Videoer',                icon: Video     },
    { id: 'home-sections',   label: 'Forside Sektioner',      icon: Home      },
    { id: 'seo-documents',   label: 'SEO Dokumenter',         icon: Globe     },
    { id: 'users',           label: 'Brugere',                icon: Users     },
    { id: 'deploy',          label: 'Deploy til GitHub',      icon: GitBranch },
    { id: 'shop',            label: 'Shop',                   icon: ShoppingBag },
    { id: 'preview-360',     label: '360° Preview',           icon: ScanLine  },
    { id: 'preview-links',   label: 'Preview Links',          icon: Link2     },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'bookings':        return <ErrorBoundary><BookingsManager /></ErrorBoundary>;
      case 'booking-config':  return <ErrorBoundary><BookingConfigManager /></ErrorBoundary>;
      case 'products':        return <ErrorBoundary><ProductsManager /></ErrorBoundary>;
      case 'portfolio':       return <ErrorBoundary><PortfolioManager /></ErrorBoundary>;
      case 'client-logos':    return <ErrorBoundary><ClientLogosManager /></ErrorBoundary>;
      case 'zones':           return <ErrorBoundary><AddressZonesManager /></ErrorBoundary>;
      case 'newsletter':      return <ErrorBoundary><NewsletterManager /></ErrorBoundary>;
      case 'external-images': return <ErrorBoundary><ExternalImagesManager /></ErrorBoundary>;
      case 'home-sections':   return <ErrorBoundary><HomeSectionsManager /></ErrorBoundary>;
      case 'donations':       return <ErrorBoundary><DonationsManager /></ErrorBoundary>;
      case 'video':           return <ErrorBoundary><VideoManager /></ErrorBoundary>;
      case 'users':           return <ErrorBoundary><AdminUsersPanel /></ErrorBoundary>;
      case 'deploy':          return <ErrorBoundary><DeployContentManager /></ErrorBoundary>;
      case 'seo-documents':   return <ErrorBoundary><SeoDocumentsManager /></ErrorBoundary>;
      case 'shop':            return <ErrorBoundary><ShopManager /></ErrorBoundary>;
      case 'preview-360':     return <ErrorBoundary><Preview360Manager /></ErrorBoundary>;
      case 'preview-links':   return <ErrorBoundary><PreviewLinksManager /></ErrorBoundary>;
      default:                return null;
    }
  };

  return (
    <div className="pt-24 pb-16 min-h-screen">
      <div className="container">
        <div className="max-w-7xl mx-auto">
          <EditableContent
            contentKey="admin-page-title"
            as="h1"
            className="text-3xl font-bold mb-8"
            fallback="Admin Panel"
          />

          {/* Tab Navigation */}
          <div className="bg-neutral-800 rounded-xl shadow-md overflow-hidden border border-neutral-700 mb-8">
            <div className="flex overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => navigate(`/admin/${tab.id}`)}
                    className={`flex items-center space-x-2 px-6 py-4 whitespace-nowrap font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'text-primary border-b-2 border-primary bg-neutral-700/50'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-700/30'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          <div className="bg-neutral-800 rounded-xl shadow-md p-6 border border-neutral-700">
            <ErrorBoundary>
              {renderTabContent()}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;

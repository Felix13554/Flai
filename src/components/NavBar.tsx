import EditableContent from './EditableContent';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Coins, ArrowDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

// SearchButton has its own search logic — lazy load to remove from initial parse
const SearchButton = lazy(() => import('./SearchButton'));

const NavBar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, signOut, isAdmin, credits } = useAuth();
  const { getContent } = useData();
  const location = useLocation();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const smoothScrollToFooter = () => {
    const el = document.getElementById('contact-footer');
    if (!el) return;
    const targetY = el.getBoundingClientRect().top + window.scrollY;
    const startY = window.scrollY;
    const distance = targetY - startY;
    const duration = 800;
    let startTime: number | null = null;

    const easeInOut = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      window.scrollTo(0, startY + distance * easeInOut(progress));
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  const scrollToFooter = () => {
    setIsMenuOpen(false);
    smoothScrollToFooter();
  };

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const navbarClasses = `fixed top-0 left-0 right-0 z-50 transition-colors duration-300 py-3 ${
    isScrolled || location.pathname !== '/' 
      ? 'bg-neutral-900 shadow-lg' 
      : 'bg-transparent'
  }`;

  const linkClasses = `font-medium transition-colors duration-300 text-white hover:text-neutral-300`;
  
  const showLogoInNav = isScrolled || location.pathname !== '/';
  const navLinksClasses = `hidden md:flex items-center transition-all duration-500 ${
    showLogoInNav ? 'space-x-8' : 'space-x-8 md:ml-auto'
  }`;

  const authLink = `/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  const mobileMenuClasses = `fixed inset-0 bg-neutral-900 z-50 flex flex-col ${
    isMenuOpen ? 'translate-x-0' : 'translate-x-full'
  } transition-transform duration-300 ease-in-out overflow-y-auto`;

  return (
    <nav className={navbarClasses}>
      <div className="container flex justify-between items-center">
        <Link 
          to="/" 
          className={`h-10 transition-opacity duration-500 ${
            showLogoInNav ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={!showLogoInNav}
          tabIndex={showLogoInNav ? undefined : -1}
        >
          <img
            src={getContent('site-logo', "/Logo.webp", 'image')}
            alt="Flai.dk"
            width="120"
            height="40"
            className="h-full w-auto"
            fetchPriority="high"
            loading="eager"
          />
        </Link>
        
        <div className={navLinksClasses}>
          <Link to="/" className={linkClasses}><EditableContent contentKey="nav-bar-hjem-2" fallback="Hjem" /></Link>
          <Link to="/products" className={linkClasses}><EditableContent contentKey="nav-bar-vores-tjenester-2" fallback="Vores tjenester" /></Link>
          <Link to="/portfolio" className={linkClasses}><EditableContent contentKey="nav-bar-vores-arbejde-2" fallback="Vores arbejde" /></Link>
          <Link to="/coverage" className={linkClasses}><EditableContent contentKey="nav-bar-vi-daekker-2" fallback="Vi dækker" /></Link>
          <button onClick={scrollToFooter} className={linkClasses}><EditableContent contentKey="nav-bar-kontakt-2" fallback="Kontakt" /></button>
          
          {/* Search Button */}
          <Suspense fallback={<div className="w-8 h-5" />}>
            <SearchButton />
          </Suspense>
          
          {user ? (
            <div className="relative group">
              <button className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                {user.user_metadata?.avatar_url ? (
                  <img 
                    src={user.user_metadata.avatar_url} 
                    alt="Profile" 
                    className="w-9 h-9 rounded-full object-cover shadow-lg border-2 border-white/20"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-medium shadow-lg">
                    <User size={20} />
                  </div>
                )}
              </button>
              <div className="absolute right-0 mt-3 w-64 bg-neutral-800 rounded-lg shadow-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 border border-neutral-700">
                {/* User Info Section */}
                <div className="px-4 py-3 bg-neutral-900 border-b border-neutral-700">
                  <div className="flex items-center space-x-3">
                    {user.user_metadata?.avatar_url ? (
                      <img 
                        src={user.user_metadata.avatar_url} 
                        alt="Profile" 
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-medium">
                        <User size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {user.user_metadata?.full_name || user.user_metadata?.name || 'User'}
                      </p>
                      <p className="text-xs text-neutral-400 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="py-1">
                  {isAdmin && (
                    <Link to="/admin" className="flex items-center px-4 py-2.5 text-neutral-200 hover:bg-neutral-700 transition-colors">
                      <User size={18} className="mr-3 text-neutral-400" />
                      <span className="font-medium"><EditableContent contentKey="nav-bar-admin-panel-2" fallback="Admin Panel" /></span>
                    </Link>
                  )}
                  {isAdmin && (
                    <Link to="/finance" className="flex items-center px-4 py-2.5 text-neutral-200 hover:bg-neutral-700 transition-colors">
                      <TrendingUp size={18} className="mr-3 text-neutral-400" />
                      <span className="font-medium"><EditableContent contentKey="nav-bar-oekonomi-2" fallback="Økonomi" /></span>
                    </Link>
                  )}
                  <Link to="/profile" className="flex items-center px-4 py-2.5 text-neutral-200 hover:bg-neutral-700 transition-colors">
                    <User size={18} className="mr-3 text-neutral-400" />
                    <span className="font-medium"><EditableContent contentKey="nav-bar-min-profil-2" fallback="Min Profil" /></span>
                  </Link>
                  <Link to="/buy-credits" className="flex items-center justify-between px-4 py-2.5 text-neutral-200 hover:bg-neutral-700 transition-colors">
                    <div className="flex items-center">
                      <Coins size={18} className="mr-3 text-neutral-400" />
                      <span className="font-medium"><EditableContent contentKey="nav-bar-koeb-credits-2" fallback="Køb Credits" /></span>
                    </div>
                    {credits > 0 && (
                      <div className="flex items-center bg-primary/20 px-2.5 py-1 rounded-full ml-2">
                        <Coins size={12} className="text-primary mr-1" />
                        <span className="text-primary text-xs font-semibold">{credits}</span>
                      </div>
                    )}
                  </Link>
                </div>
                
                {/* Logout Section */}
                <div className="border-t border-neutral-700">
                  <button 
                    onClick={() => signOut(location.pathname + location.search)}
                    className="w-full flex items-center px-4 py-2.5 text-neutral-200 hover:bg-neutral-700 transition-colors"
                  >
                    <LogOut size={18} className="mr-3 text-neutral-400" />
                    <span className="font-medium"><EditableContent contentKey="nav-bar-log-ud-2" fallback="Log ud" /></span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Link 
              to={authLink}
              rel="nofollow"
              className="px-4 py-2 rounded-lg border border-white text-white hover:bg-white hover:text-neutral-900 transition-colors duration-300"
            >
              <EditableContent contentKey="nav-bar-log-ind-2" fallback="Log ind" />
            </Link>
          )}
        </div>
        
        <div className="md:hidden flex items-center space-x-4">
          <Suspense fallback={<div className="w-6 h-6" />}>
            <SearchButton isMobile />
          </Suspense>
          <button
            className="text-white"
            onClick={toggleMenu}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            aria-label="Åbn menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div id="mobile-menu" className={mobileMenuClasses}>
        <div className="p-5 flex-shrink-0">
          <div className="flex justify-between items-center mb-6">
            <Link to="/" className="h-10" onClick={() => setIsMenuOpen(false)}>
              <img
                src={getContent('site-logo', "/Logo.webp", 'image')}
                alt="Flai.dk"
                width="120"
                height="40"
                className="h-full w-auto"
                fetchPriority="high"
                loading="eager"
              />
            </Link>
            <button onClick={toggleMenu} aria-label="Luk menu">
              <X size={24} className="text-white" />
            </button>
          </div>

          {/* User Profile Section for Mobile - At Top */}
          {user && (
            <div className="mb-6 p-4 bg-neutral-800 rounded-lg border border-neutral-700">
              <div className="flex items-center space-x-3 mb-4">
                {user.user_metadata?.avatar_url ? (
                  <img 
                    src={user.user_metadata.avatar_url} 
                    alt="Profile" 
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-medium">
                    <User size={22} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-white truncate">
                    {user.user_metadata?.full_name || user.user_metadata?.name || 'User'}
                  </p>
                  <p className="text-sm text-neutral-400 truncate">
                    {user.email}
                  </p>
                </div>
              </div>
              
              {/* Account Actions */}
              <div className="space-y-2">
                {isAdmin && (
                  <Link to="/admin" className="flex items-center text-white hover:text-neutral-300 transition-colors py-2" onClick={() => setIsMenuOpen(false)}>
                    <User size={18} className="mr-3 text-neutral-400" />
                    <span className="font-medium"><EditableContent contentKey="nav-bar-admin-panel" fallback="Admin Panel" /></span>
                  </Link>
                )}
                {isAdmin && (
                  <Link to="/finance" className="flex items-center text-white hover:text-neutral-300 transition-colors py-2" onClick={() => setIsMenuOpen(false)}>
                    <TrendingUp size={18} className="mr-3 text-neutral-400" />
                    <span className="font-medium"><EditableContent contentKey="nav-bar-oekonomi" fallback="Økonomi" /></span>
                  </Link>
                )}
                <Link to="/profile" className="flex items-center text-white hover:text-neutral-300 transition-colors py-2" onClick={() => setIsMenuOpen(false)}>
                  <User size={18} className="mr-3 text-neutral-400" />
                  <span className="font-medium"><EditableContent contentKey="nav-bar-min-profil" fallback="Min Profil" /></span>
                </Link>
                <Link to="/buy-credits" className="flex items-center justify-between text-white hover:text-neutral-300 transition-colors py-2" onClick={() => setIsMenuOpen(false)}>
                  <div className="flex items-center">
                    <Coins size={18} className="mr-3 text-neutral-400" />
                    <span className="font-medium"><EditableContent contentKey="nav-bar-koeb-credits" fallback="Køb Credits" /></span>
                  </div>
                  {credits > 0 && (
                    <div className="flex items-center bg-primary/20 px-2.5 py-1 rounded-full">
                      <Coins size={14} className="text-primary mr-1" />
                      <span className="text-primary text-sm font-semibold">{credits}</span>
                    </div>
                  )}
                </Link>
              </div>
              
              {/* Logout Button */}
              <div className="border-t border-neutral-700 mt-3 pt-3">
                <button 
                  onClick={() => {
                    signOut(location.pathname + location.search);
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center text-red-400 hover:text-red-300 transition-colors w-full"
                >
                  <LogOut size={18} className="mr-3" />
                  <span className="font-medium"><EditableContent contentKey="nav-bar-log-ud" fallback="Log ud" /></span>
                </button>
              </div>
            </div>
          )}
          
          {/* Navigation Links */}
          <div className="flex flex-col space-y-4">
            <Link to="/" className="text-lg font-medium text-white py-2" onClick={() => setIsMenuOpen(false)}><EditableContent contentKey="nav-bar-hjem" fallback="Hjem" /></Link>
            <Link to="/products" className="text-lg font-medium text-white py-2" onClick={() => setIsMenuOpen(false)}><EditableContent contentKey="nav-bar-vores-tjenester" fallback="Vores tjenester" /></Link>
            <Link to="/portfolio" className="text-lg font-medium text-white py-2" onClick={() => setIsMenuOpen(false)}><EditableContent contentKey="nav-bar-vores-arbejde" fallback="Vores arbejde" /></Link>
            <Link to="/coverage" className="text-lg font-medium text-white py-2" onClick={() => setIsMenuOpen(false)}><EditableContent contentKey="nav-bar-vi-daekker" fallback="Vi dækker" /></Link>
            <Link to="/ratings" className="text-lg font-medium text-white py-2" onClick={() => setIsMenuOpen(false)}><EditableContent contentKey="nav-bar-anmeldelser" fallback="Anmeldelser" /></Link>
            
            {/* Contact button for mobile */}
            <button 
              onClick={scrollToFooter}
              className="text-lg font-medium text-white flex items-center py-2"
            >
              <EditableContent contentKey="nav-bar-kontakt" fallback="Kontakt" />
              <ArrowDown size={18} className="ml-2" />
            </button>
            
            {/* Login Button if not logged in */}
            {!user && (
              <>
                <div className="border-t border-neutral-700 my-2"></div>
                <Link 
                  to={authLink}
                  rel="nofollow"
                  className="text-lg font-medium text-white py-3 px-4 border border-white rounded-lg hover:bg-white hover:text-neutral-900 transition-colors text-center"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <EditableContent contentKey="nav-bar-log-ind" fallback="Log ind" />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;

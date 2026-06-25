import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Instagram, Linkedin, Youtube, X, Facebook, MapPin, Send, Loader2, CheckCircle } from 'lucide-react';
import EditableContent from './EditableContent';
import { useData } from '../contexts/DataContext';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const { getContent } = useData();
  
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNewsletterSubmitting, setIsNewsletterSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isNewsletterSuccess, setIsNewsletterSuccess] = useState(false);
  const [error, setError] = useState('');
  const [newsletterError, setNewsletterError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contact-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send message');
      setIsSuccess(true);
      setFormData({ name: '', email: '', message: '' });
      setTimeout(() => setIsSuccess(false), 5000);
    } catch (err) {
      console.error('Contact form error:', err);
      setError(err instanceof Error ? err.message : 'Der opstod en fejl. PrÃÂÃÂ¸v igen senere.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterError('');
    setIsNewsletterSubmitting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/subscribe-newsletter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: newsletterEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to subscribe');
      setIsNewsletterSuccess(true);
      setNewsletterEmail('');
      setTimeout(() => setIsNewsletterSuccess(false), 5000);
    } catch (err) {
      console.error('Newsletter subscription error:', err);
      setNewsletterError(err instanceof Error ? err.message : 'Der opstod en fejl. PrÃÂÃÂ¸v igen senare.');
    } finally {
      setIsNewsletterSubmitting(false);
    }
  };

  return (
    <footer id="contact-footer" className="bg-[#171717] text-white pt-12 pb-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-secondary rounded-full blur-3xl"></div>
      </div>

      <div className="container relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <Link to="/" className="inline-block mb-4">
              <img src={getContent('site-logo', "/Logo.webp")} alt="Flai.dk" width="120" height="40" className="h-10 w-auto" />
            </Link>
            <EditableContent
              contentKey="footer-description"
              as="p"
              className="text-white/90 mb-4"
              fallback="Dronefoto og video i Trekantsområdet. 100% tilfredshedsgaranti."
            />
            <div className="flex space-x-4">

              <a href="https://www.facebook.com/profile.php?id=61584155103217" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors"><Facebook size={20} /></a>
            
              <a href="https://www.youtube.com/@flai-i3j" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors"><Youtube size={20} /></a>
              <a href="https://x.com/fb_flai" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors"><X size={20} /></a>
            </div>
          </div>
          
          <div>
            <EditableContent contentKey="footer-contact-heading" as="h3" className="text-lg font-semibold mb-4" fallback="Kontakt os" />
            <ul className="space-y-3 text-white/90">
              <li className="flex items-center group">
                <Mail size={18} className="mr-2 flex-shrink-0" />
                <a href={`mailto:${getContent('contact-email', "fb@flai.dk")}`} className="hover:text-white transition-colors break-all">
                  {getContent('contact-email', "fb@flai.dk")}
                </a>
              </li>
              <li className="flex items-center group">
                <Phone size={18} className="mr-2 flex-shrink-0" />
                <a href={`tel:${getContent('contact-phone', "+45 27 29 21 99")}`} className="hover:text-white transition-colors">
                  {getContent('contact-phone', "+45 27 29 21 99")}
                </a>
              </li>
              <li className="flex items-start">
                <MapPin size={18} className="mr-2 mt-1 flex-shrink-0" />
                <EditableContent contentKey="footer-location" as="span" fallback="Trekantsområdet" />
              </li>
            </ul>
            
            <div className="mt-6">
              <EditableContent contentKey="footer-links-heading" as="h4" className="text-sm font-semibold mb-2" fallback="Hurtige links" />
              <ul className="space-y-1 text-white/90 text-sm">
                <li><Link to="/" className="hover:text-white transition-colors"><EditableContent contentKey="footer-link-home" fallback="Hjem" /></Link></li>
                <li><Link to="/products" className="hover:text-white transition-colors"><EditableContent contentKey="footer-link-products" fallback="Vores tjenester" /></Link></li>
                <li><Link to="/portfolio" className="hover:text-white transition-colors"><EditableContent contentKey="footer-link-portfolio" fallback="Vores arbejde" /></Link></li>
                <li><Link to="/coverage" className="hover:text-white transition-colors"><EditableContent contentKey="footer-link-coverage" fallback="Vi dækker" /></Link></li>
                <li><Link to="/merch" className="hover:text-white transition-colors"><EditableContent contentKey="footer-link-merch" fallback="Merchandise" /></Link></li>

              </ul>
            </div>
          </div>
          
          <div>
            <EditableContent contentKey="footer-contact-form-heading" as="h3" className="text-lg font-semibold mb-4" fallback="Send os en besked" />
            
            {isSuccess ? (
              <div className="flex items-center space-x-2 bg-success/20 border border-success rounded-lg px-4 py-3 mb-6">
                <CheckCircle size={20} className="text-success flex-shrink-0" />
                <EditableContent contentKey="footer-form-success" as="span" className="text-sm text-white" fallback="Tak for din besked! Vi vender tilbage hurtigst muligt." />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3 mb-6">
                <input type="text" value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={getContent('footer-form-name-placeholder', 'Navn')} required disabled={isSubmitting}
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all disabled:opacity-50" />
                <input type="email" value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={getContent('footer-form-email-placeholder', 'Email')} required disabled={isSubmitting}
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all disabled:opacity-50" />
                <textarea value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder={getContent('footer-form-message-placeholder', 'Besked')} required disabled={isSubmitting} rows={4}
                  className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all disabled:opacity-50 resize-none" />
                <button type="submit" disabled={isSubmitting}
                  className="w-full px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                  {isSubmitting
                    ? <><Loader2 size={18} className="animate-spin mr-2" />{getContent('footer-form-sending', 'Sender...')}</>
                    : <><Send size={18} className="mr-2" />{getContent('footer-form-submit', 'Send besked')}</>}
                </button>
                {error && <p className="text-error text-sm">{error}</p>}
              </form>
            )}

            <div className="pt-6 border-t border-white/20">
              <EditableContent contentKey="footer-newsletter-heading" as="h3" className="text-lg font-semibold mb-3" fallback="Tilmeld Nyhedsbrev" />
              {isNewsletterSuccess ? (
                <div className="flex items-center space-x-2 bg-success/20 border border-success rounded-lg px-4 py-3">
                  <CheckCircle size={18} className="text-success flex-shrink-0" />
                  <EditableContent contentKey="footer-newsletter-success" as="span" className="text-sm text-white" fallback="Tak! Du er nu tilmeldt vores nyhedsbrev." />
                </div>
              ) : (
                <form onSubmit={handleNewsletterSubmit} className="space-y-3">
                  <div className="flex space-x-2">
                    <input type="email" value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      placeholder={getContent('footer-newsletter-placeholder', 'Din email')} required disabled={isNewsletterSubmitting}
                      className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all disabled:opacity-50" />
                    <button type="submit" disabled={isNewsletterSubmitting}
                      className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                      {isNewsletterSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                  {newsletterError && <p className="text-error text-sm">{newsletterError}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
        
        <div className="border-t border-white/20 pt-6 text-center text-white/70 text-sm">
          <p>© {currentYear} <EditableContent contentKey="footer-copyright" fallback="Flai. Alle rettigheder forbeholdes." /></p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

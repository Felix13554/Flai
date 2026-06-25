import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useData } from '../contexts/DataContext';

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  noIndex?: boolean;
  schema?: object;
}

const BASE_URL = 'https://flai.dk';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.jpg`;
const DEFAULT_DESCRIPTION = 'Flai - Dronefoto og video i Trekantsområdet. 100% tilfredshedsgaranti. Book nemt og hurtigt på vores hjemmeside. Vi dækker Kolding, Vejle, Fredericia, Haderslev, Middelfart, Hedensted, Vejen, Vojens, Børkop, Strib, Bogense, Juelsminde, Taulov, Nørre Åby.';

// Maps each canonical path to its page subtitle content key and fallback text.
// This ensures the SEO description always matches what's shown as the header
// subtitle on each page, using the same editable content source.
const PAGE_SUBTITLE_MAP: Record<string, { key: string; fallback: string }> = {
  '/': {
    key: 'hero-subtitle',
    fallback: DEFAULT_DESCRIPTION,
  },
  '/products': {
    key: 'services-subtitle',
    fallback: 'Udforsk vores udvalg af optagelser eller billeder og find den perfekte løsning til dit næste projekt.',
  },
  '/portfolio': {
    key: 'portfolio-page-subtitle',
    fallback: 'Udforsk vores seneste film og projekter.',
  },
  '/coverage': {
    key: 'coverage-page-subtitle',
    fallback: 'Vi tilbyder droneoptagelser i følgende områder. Kontakt os hvis du har spørgsmål om dækning i dit område.',
  },
  '/ratings': {
    key: 'ratings-page-subtitle',
    fallback: 'Hvad siger vores kunder. Vi er stolte af vores anmeldelser og arbejder altid på at levere det bedste resultat.',
  },
     '/merch': {
    key: 'merch-page-subitle',
    fallback: '',
  },
};

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setSchema(data: object) {
  const id = 'ld-json-dynamic';
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeSchema() {
  document.getElementById('ld-json-dynamic')?.remove();
}

const SEO: React.FC<SEOProps> = ({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  noIndex = false,
  schema,
}) => {
  const { getContent } = useData();
  const location = useLocation();

  // Description is always driven by PAGE_SUBTITLE_MAP for known pages.
  // For any page not in the map, DEFAULT_DESCRIPTION is used — no description
  // prop from any page component can override this.
  const subtitleEntry = PAGE_SUBTITLE_MAP[canonical ?? location.pathname];
  const resolvedDescription = subtitleEntry
    ? getContent(subtitleEntry.key, subtitleEntry.fallback)
    : DEFAULT_DESCRIPTION;

  const fullTitle = title
    ? `Flai - ${title} - Dronefoto og video i Trekantsområdet - En ny verden`
    : `Flai - Dronefoto og video i Trekantsområdet - En ny verden`;
  // Use the explicit canonical prop when provided; otherwise derive from the
  // current pathname so every page gets its own correct canonical URL instead
  // of falling back to the homepage.
  const canonicalPath = canonical ?? location.pathname;
  const canonicalUrl = canonicalPath === '/' ? BASE_URL : `${BASE_URL}${canonicalPath}`;

  useEffect(() => {
    document.title = fullTitle;

    setMeta('description', resolvedDescription);
    setMeta('robots', noIndex ? 'noindex, nofollow' : 'index, follow');
    setLink('canonical', canonicalUrl);

    setMeta('og:type', ogType, 'property');
    setMeta('og:site_name', 'Flai', 'property');
    setMeta('og:url', canonicalUrl, 'property');
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:description', resolvedDescription, 'property');
    setMeta('og:image', ogImage, 'property');

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', fullTitle);
    setMeta('twitter:description', resolvedDescription);
    setMeta('twitter:image', ogImage);

    if (schema) {
      setSchema(schema);
    } else {
      removeSchema();
    }
  }, [fullTitle, resolvedDescription, canonicalUrl, ogImage, ogType, noIndex, schema, location.pathname]);

  return null;
};

export default SEO;
export { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE };

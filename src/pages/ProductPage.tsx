import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowLeft, ExternalLink } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import EditableContent from '../components/EditableContent';
import SEO from '../components/SEO';
import PanoramaViewer from '../components/PanoramaViewer';
import { Product } from '../types';


const ProductPage: React.FC = () => {
  const { name: encodedName } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { products, isProductsLoaded } = useData();
  const [product, setProduct] = useState<Product | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!encodedName) {
      navigate('/products');
      return;
    }

    if (!isProductsLoaded || products.length === 0) {
      return;
    }

    let productName: string;
    try {
      productName = decodeURIComponent(encodedName);
    } catch {
      productName = encodedName;
    }

    const foundProduct = products.find(p => p.name === productName);

    if (foundProduct) {
      setProduct(foundProduct);
      setLoading(false);
    } else {
      navigate('/products');
    }
  }, [encodedName, products, navigate, isProductsLoaded]);

  const handlePreviousImage = () => {
    if (product && product.images.length > 1) {
      setCurrentImageIndex((prev) =>
        prev === 0 ? product.images.length - 1 : prev - 1
      );
    }
  };

  const handleNextImage = () => {
    if (product && product.images.length > 1) {
      setCurrentImageIndex((prev) =>
        prev === product.images.length - 1 ? 0 : prev + 1
      );
    }
  };

  const handleBookNow = () => {
    navigate(`/booking/${product?.id}`);
  };

  const handleSimpleRequest = () => {
    if (product) {
      navigate(`/simple-request?product_id=${product.id}&product_name=${encodeURIComponent(product.name)}`);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getMediaType = (url: string): 'panorama' | 'youtube' | 'image' => {
    if (url.startsWith('panorama:')) return 'panorama';
    if (url.startsWith('youtube:'))  return 'youtube';
    return 'image';
  };

  // ─── Main media renderer ────────────────────────────────────────────────────

  const renderMedia = () => {
    if (!product || !product.images[currentImageIndex]) return null;

    const currentImage = product.images[currentImageIndex];
    const mediaType = getMediaType(currentImage);

    // ── 360° Panorama ────────────────────────────────────────────────────────
    if (mediaType === 'panorama') {
      const rawUrl = currentImage.replace('panorama:', '');
      return (
        <PanoramaViewer
          url={rawUrl}
          title={product.name}
          autoRotate={0.8}
          className="w-full h-full"
        />
      );
    }

    // ── YouTube ──────────────────────────────────────────────────────────────
    if (mediaType === 'youtube') {
      const videoId = currentImage.split(':')[1];
      return (
        <div className="relative w-full aspect-video">
          <iframe
            className="absolute inset-0 w-full h-full rounded-lg"
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      );
    }

    // ── Regular image ────────────────────────────────────────────────────────
    return (
      <img
        src={currentImage}
        alt={`${product.name} - billede ${currentImageIndex + 1}`}
        className="w-full h-full object-cover rounded-lg"
      />
    );
  };

  // ─── Thumbnail renderer ─────────────────────────────────────────────────────

  const renderThumbnail = (url: string, index: number) => {
    const mediaType = getMediaType(url);

    if (mediaType === 'panorama') {
      const rawUrl = url.replace('panorama:', '');
      return (
        <div className="w-full h-full bg-neutral-900 flex flex-col items-center justify-center gap-1 relative overflow-hidden">
          {/* Flat equirectangular preview behind icon */}
          <img
            src={rawUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-50"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <svg className="w-5 h-5 text-primary drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <ellipse cx="12" cy="12" rx="5" ry="10" />
              <path d="M2 12h20" />
            </svg>
            <span className="text-[8px] text-white font-bold tracking-wider bg-black/50 rounded-full px-1 leading-tight">360°</span>
          </div>
        </div>
      );
    }

    if (mediaType === 'youtube') {
      return (
        <div className="w-full h-full bg-neutral-700 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </div>
      );
    }

    return (
      <img
        src={url}
        alt={`Thumbnail ${index + 1}`}
        className="w-full h-full object-cover"
      />
    );
  };

  // ─── Loading / not-found states ─────────────────────────────────────────────

  if (loading || !isProductsLoaded) {
    return (
      <div className="pt-24 pb-16">
        <div className="container">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <EditableContent
              contentKey="product-page-loading-text"
              as="p"
              className="mt-2 text-neutral-400"
              fallback="Indlæser produkt..."
            />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="pt-24 pb-16">
        <div className="container">
          <div className="text-center py-12">
            <EditableContent
              contentKey="product-page-not-found-title"
              as="h1"
              className="text-2xl font-bold mb-4"
              fallback="Produkt ikke fundet"
            />
            <EditableContent
              contentKey="product-page-not-found-message"
              as="p"
              className="text-neutral-400 mb-6"
              fallback="Det produkt du leder efter findes ikke eller er blevet fjernet."
            />
            <Link to="/products" className="btn-primary">
              <EditableContent
                contentKey="product-page-back-to-products-button"
                fallback="Tilbage til Produkter"
              />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Determine if the current slide is a panorama — hides nav arrows since
  // Pannellum handles its own drag interaction
  const currentIsPanorama = getMediaType(product.images[currentImageIndex] ?? '') === 'panorama';

  return (
    <div className="pt-24 pb-16">
      {product && (
        <SEO
          title={product.name}
          description={`${product.description?.slice(0, 140) ?? `Book ${product.name} hos Flai – professionel dronefotografering i hele Danmark.`}`}
          canonical={`/product/${encodeURIComponent(product.name)}`}
          ogImage={
            product.images?.[0] &&
            !product.images[0].startsWith('youtube:') &&
            !product.images[0].startsWith('panorama:')
              ? product.images[0]
              : undefined
          }
          schema={{
            "@context": "https://schema.org",
            "@type": "Service",
            "name": product.name,
            "description": product.description ?? product.name,
            "provider": { "@type": "LocalBusiness", "name": "Flai", "url": "https://flai.dk" },
            "areaServed": { "@type": "Country", "name": "Danmark" },
            "offers": {
              "@type": "Offer",
              "price": product.price,
              "priceCurrency": "DKK",
              "availability": "https://schema.org/InStock"
            }
          }}
        />
      )}
      <div className="container">
        <div className="max-w-6xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => navigate('/products')}
            className="flex items-center text-neutral-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={20} className="mr-2" />
            <EditableContent
              contentKey="product-page-back-button"
              fallback="Tilbage til produkter"
            />
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Image Gallery */}
            <div className="space-y-4">
              {/* Main viewer — panoramas fill the slot natively; others use aspect-video box */}
              <div className={`relative bg-neutral-800 rounded-lg overflow-hidden ${currentIsPanorama ? '' : 'aspect-video'}`}>
                {renderMedia()}

                {/* Nav arrows — hidden when panorama is active (Pannellum handles dragging) */}
                {product.images.length > 1 && !currentIsPanorama && (
                  <>
                    <button
                      onClick={handlePreviousImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-all z-10"
                      aria-label="Forrige billede"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button
                      onClick={handleNextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-all z-10"
                      aria-label="Næste billede"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}

                {/* Compact prev/next for panorama slides — sit outside the viewer area */}
                {product.images.length > 1 && currentIsPanorama && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                    <button
                      onClick={handlePreviousImage}
                      className="p-1.5 bg-black/60 backdrop-blur-sm text-white rounded-full hover:bg-black/80 transition-all"
                      aria-label="Forrige"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-white text-xs bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-0.5">
                      {currentImageIndex + 1} / {product.images.length}
                    </span>
                    <button
                      onClick={handleNextImage}
                      className="p-1.5 bg-black/60 backdrop-blur-sm text-white rounded-full hover:bg-black/80 transition-all"
                      aria-label="Næste"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}

                {/* Image counter (non-panorama slides only) */}
                {product.images.length > 1 && !currentIsPanorama && (
                  <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/50 text-white text-sm rounded-full z-10">
                    {currentImageIndex + 1} / {product.images.length}
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              {product.images.length > 1 && (
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {product.images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        index === currentImageIndex
                          ? 'border-primary'
                          : 'border-neutral-700 hover:border-neutral-500'
                      }`}
                    >
                      {renderThumbnail(image, index)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Information */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <h1 className="text-3xl font-bold">{product.name}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    product.category === 'video'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-green-500/10 text-green-400'
                  }`}>
                    {product.category === 'video' ? 'Video' : 'Foto'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-primary mb-4">{product.price} <EditableContent contentKey="product-page-kr" fallback="kr" /></p>
              </div>

              <div>
                <EditableContent
                  contentKey="product-page-description-title"
                  as="h2"
                  className="text-xl font-semibold mb-3"
                  fallback="Beskrivelse"
                />
                <p className="text-neutral-300 leading-relaxed">{product.description}</p>
              </div>

              {/* Product Links */}
              {product.links && product.links.length > 0 && (
                <div>
                  <EditableContent
                    contentKey="product-page-links-title"
                    as="h2"
                    className="text-xl font-semibold mb-3"
                    fallback="Relaterede links"
                  />
                  <div className="space-y-2">
                    {product.links.map((link, index) => (
                      <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-primary hover:text-primary-dark transition-colors"
                      >
                        <ExternalLink size={16} className="mr-2" />
                        {link.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Features */}
              <div>
                <EditableContent
                  contentKey="product-page-features-title"
                  as="h2"
                  className="text-xl font-semibold mb-3"
                  fallback="Hvad får du"
                />
                <ul className="space-y-2 text-neutral-300">
                  {product.category === 'video' ? (
                    <>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-primary rounded-full mr-3"></span>
                        <EditableContent contentKey="product-page-video-feature-1" fallback="4K videooptagelse" />
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-primary rounded-full mr-3"></span>
                        <EditableContent contentKey="product-page-video-feature-2" fallback="Stabiliseret optagelse med gimbal" />
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-primary rounded-full mr-3"></span>
                        <EditableContent contentKey="product-page-video-feature-3" fallback="Levering inden for 5-7 dage" />
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-primary rounded-full mr-3"></span>
                        <EditableContent contentKey="product-page-photo-feature-1" fallback="Højopløselige 12MP billeder" />
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-primary rounded-full mr-3"></span>
                        <EditableContent contentKey="product-page-photo-feature-2" fallback="Valgfrit antal billeder" />
                      </li>
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-primary rounded-full mr-3"></span>
                        <EditableContent contentKey="product-page-photo-feature-3" fallback="Farvekorrigering" />
                      </li>
                    </>
                  )}
                </ul>
              </div>

              {/* Optional Editing */}
              {product.category === 'video' && (product.is_editing_included ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <div className="flex items-center">
                    <svg className="w-6 h-6 text-green-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <EditableContent
                        contentKey="product-page-editing-included-title"
                        as="h3"
                        className="font-semibold text-green-400 mb-1"
                        fallback="Redigering inkluderet"
                      />
                      <EditableContent
                        contentKey="product-page-editing-included-description"
                        as="p"
                        className="text-neutral-300 text-sm"
                        fallback="Dette produkt inkluderer redigering som farvekorrigering, klipning, baggrundsmusik og lydeffekter."
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-800/50 rounded-lg p-4">
                  <EditableContent
                    contentKey="product-page-editing-title"
                    as="h3"
                    className="font-semibold mb-2"
                    fallback="Tilvalg: redigering"
                  />
                  <EditableContent
                    contentKey="product-page-editing-description"
                    as="p"
                    className="text-neutral-300 text-sm mb-2"
                    fallback="Få redigering af dine optagelser, herunder klipning, effekter, lydeffekter og baggrundsmusik."
                  />
                  <EditableContent
                    contentKey="product-page-editing-price"
                    as="p"
                    className="text-primary font-semibold"
                    fallback="+100 kr"
                  />
                </div>
              ))}

              {/* Book Now Buttons */}
              <div className="pt-4 flex flex-row space-x-3">
                <button
                  onClick={handleSimpleRequest}
                  className="flex-1 btn-primary py-3 px-2 flex flex-col items-center justify-center min-h-[80px]"
                >
                  <span className="font-bold text-base block"><EditableContent contentKey="product-page-smart-booking" fallback="Smart Booking" /></span>
                  <span className="text-[10px] sm:text-xs opacity-80 font-normal leading-tight mt-1">
                    <EditableContent contentKey="product-page-vi-vaelger-dato-og-tid" fallback="Vi vælger dato og tid efter lysforholdene" />
                  </span>
                </button>

                <button
                  onClick={handleBookNow}
                  className="flex-1 btn-secondary py-3 px-2 border-2 border-primary/30 hover:border-primary/60 transition-colors flex flex-col items-center justify-center min-h-[80px]"
                >
                  <span className="font-bold text-base block"><EditableContent contentKey="product-page-book-nu" fallback="Book Nu" /></span>
                  <span className="text-[10px] sm:text-xs opacity-80 font-normal leading-tight mt-1">
                    <EditableContent contentKey="product-page-du-vaelger-selv-tid-og" fallback="Du vælger selv tid og dato efter dine behov" />
                  </span>
                </button>
              </div>

              <EditableContent
                contentKey="product-page-book-note"
                as="p"
                className="text-neutral-400 text-sm text-center mt-2"
                fallback="Udfyld de nødvendige oplysninger på næste side."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;

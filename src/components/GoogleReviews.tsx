import EditableContent from './EditableContent';
import React, { useEffect, useRef, useState, useCallback } from "react";

const SUPABASE_URL = "https://kzvdgdfxxkxeaihrqigd.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dmRnZGZ4eGt4ZWFpaHJxaWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNDQwNzQsImV4cCI6MjA4MDYyMDA3NH0.ZOmXme0uhK5gi7MTEnzJgY1mHiRGQZIgrvGQ1-nTwsw";
const PLACE_ID = "ChIJq5JklwgFuQ0RREPIKUg0EHs";
const MAX_REVIEWS = 20;

const STORAGE_KEY = "reviews_" + PLACE_ID;
const EXPIRES_AT_KEY = "expires_at_" + PLACE_ID;
const RATING_KEY = "rating_" + PLACE_ID;

interface ReviewUser {
  name: string;
  thumbnail?: string;
  local_guide?: boolean;
  reviews?: number;
}

interface ReviewImage {
  thumbnail: string;
}

interface OwnerResponse {
  text: string;
  date?: string;
}

interface Review {
  user: ReviewUser;
  rating: number;
  date: string;
  snippet: string;
  link?: string;
  images?: ReviewImage[];
  owner_response?: OwnerResponse;
  likes?: number;
}

// ── SVGs ──────────────────────────────────────────────────────────────────────

const GoogleLogoSVG: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const GoogleIconSVG: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: "100%", height: "100%" }}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const VerifiedBadgeSVG: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="#3B82F6" style={{ width: 16, height: 16 }}>
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

const UserIconSVG: React.FC = () => (
  <svg fill="#9CA3AF" viewBox="0 0 24 24" style={{ width: 24, height: 24 }}>
    <circle cx="12" cy="8" r="4" />
    <path d="M12 14c-6 0-8 3-8 5v2h16v-2c0-2-2-5-8-5z" />
  </svg>
);

const MessageIconSVG: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#60A5FA"
    strokeWidth="2"
    style={{ width: 16, height: 16, flexShrink: 0 }}
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// ── Star renderer ─────────────────────────────────────────────────────────────

const Stars: React.FC<{ rating: number; size?: number }> = ({ rating, size = 16 }) => (
  <div style={{ display: "flex", gap: 2 }}>
    {Array.from({ length: 5 }, (_, i) => (
      <svg key={i} width={size} height={size} fill={i < rating ? "#FBBF24" : "#4B5563"} viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ))}
  </div>
);

// ── Helper ────────────────────────────────────────────────────────────────────

function shouldFetchReviews(): boolean {
  const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return new Date() >= new Date(expiresAt);
}

async function fetchReviewsFromAPI(): Promise<{ reviews: Review[]; rating: string }> {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/fetch-reviews?place_id=${PLACE_ID}`,
    { headers: { Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!response.ok) throw new Error("Kunne ikke hente anmeldelser: " + response.statusText);

  const data = await response.json();
  if (!data.reviews || data.reviews.length === 0) throw new Error("Ingen anmeldelser fundet");

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data.reviews));
  if (data.rating) localStorage.setItem(RATING_KEY, data.rating.toString());

  const nextMidnight = new Date();
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);
  localStorage.setItem(EXPIRES_AT_KEY, nextMidnight.toISOString());

  return { reviews: data.reviews, rating: data.rating || "0.0" };
}

// ── Review Card ───────────────────────────────────────────────────────────────

const ReviewCard: React.FC<{ review: Review; index: number }> = ({ review, index }) => {
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [responseExpanded, setResponseExpanded] = useState(false);

  const shouldTruncateReview = review.snippet.length > 200;
  const shouldTruncateResponse =
    !!review.owner_response?.text && review.owner_response.text.length > 70;

  const handleGoogleIconClick = () => {
    const link = review.link?.trim();
    window.open(
      link || `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const likesText = review.likes === 1 ? "person fandt" : "personer fandt";

  return (
    <div style={styles.reviewCard} onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 10px 15px rgba(0,0,0,0.2)";
    }} onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
    }}>
      {/* Google icon */}
      <div
        style={styles.googleIcon}
        title="Se på Google"
        onClick={handleGoogleIconClick}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "scale(1.1)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "scale(1)"; }}
      >
        <GoogleIconSVG />
      </div>

      {/* Header */}
      <div style={styles.reviewHeader}>
        {review.user.thumbnail ? (
          <img src={review.user.thumbnail} alt={review.user.name} style={styles.avatar} />
        ) : (
          <div style={styles.avatarPlaceholder}><UserIconSVG /></div>
        )}
        <div style={styles.userInfo}>
          <div style={styles.userNameRow}>
            <h3 style={styles.userName}>{review.user.name}</h3>
            <span title="Verificeret"><VerifiedBadgeSVG /></span>
          </div>
          {review.user.local_guide && <span style={styles.localGuide}><EditableContent contentKey="google-reviews-lokal-guide" fallback="Lokal Guide" /></span>}
          {review.user.reviews && (
            <p style={styles.reviewCountUser}>{review.user.reviews} <EditableContent contentKey="google-reviews-anmeldelser" fallback="anmeldelser" /></p>
          )}
        </div>
      </div>

      {/* Rating + date */}
      <div style={styles.ratingDate}>
        <Stars rating={review.rating} />
        <span style={styles.date}>{review.date}</span>
      </div>

      {/* Review text */}
      <div>
        <p
          style={{
            ...styles.reviewText,
            ...(shouldTruncateReview && !reviewExpanded ? styles.truncated4 : {}),
          }}
        >
          {review.snippet}
        </p>
        {shouldTruncateReview && (
          <button style={styles.showMoreBtn} onClick={() => setReviewExpanded(v => !v)}>
            {reviewExpanded ? "Vis mindre" : "Vis mere"}
          </button>
        )}
      </div>

      {/* Images */}
      {review.images && review.images.length > 0 && (
        <div style={styles.reviewImages}>
          {review.images.slice(0, 3).map((img, j) => (
            <img key={j} src={img.thumbnail} alt="Anmeldelsesbillede" style={styles.reviewImage} />
          ))}
        </div>
      )}

      {/* Owner response */}
      {review.owner_response?.text && (
        <div style={styles.ownerResponse}>
          <div style={styles.ownerResponseHeader}>
            <MessageIconSVG />
            <span style={styles.ownerResponseTitle}><EditableContent contentKey="google-reviews-svar-fra-ejeren" fallback="Svar fra ejeren" /></span>
          </div>
          {review.owner_response.date && (
            <span style={styles.ownerResponseDate}>{review.owner_response.date}</span>
          )}
          <p
            style={{
              ...styles.ownerResponseText,
              ...(shouldTruncateResponse && !responseExpanded ? styles.truncated1 : {}),
            }}
          >
            {review.owner_response.text}
          </p>
          {shouldTruncateResponse && (
            <button style={styles.showMoreBtn} onClick={() => setResponseExpanded(v => !v)}>
              {responseExpanded ? "Vis mindre" : "Vis mere"}
            </button>
          )}
        </div>
      )}

      {/* Likes */}
      {review.likes && review.likes > 0 ? (
        <div style={styles.likes}>{review.likes} {likesText} <EditableContent contentKey="google-reviews-dette-nyttigt" fallback="dette nyttigt" /></div>
      ) : null}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const GoogleReviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState<string>("0.0");
  const [status, setStatus] = useState<"loading" | "error" | "loaded">("loading");
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleNextUpdate = useCallback((loadFn: (force: boolean) => void) => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
    if (!expiresAt) return;
    const timeUntilExpiration = new Date(expiresAt).getTime() - Date.now();
    if (timeUntilExpiration > 0) {
      refreshTimeoutRef.current = setTimeout(() => loadFn(true), timeUntilExpiration + 10000);
    } else {
      loadFn(true);
    }
  }, []);

  const loadReviews = useCallback(async (forceRefresh: boolean) => {
    const cachedReviewsRaw = localStorage.getItem(STORAGE_KEY);
    const cachedRating = localStorage.getItem(RATING_KEY);

    if (cachedReviewsRaw && !shouldFetchReviews() && !forceRefresh) {
      const cached: Review[] = JSON.parse(cachedReviewsRaw);
      setReviews(cached.slice(0, MAX_REVIEWS));
      setRating(cachedRating || "0.0");
      setStatus("loaded");
      scheduleNextUpdate(loadReviews);
      return;
    }

    try {
      const data = await fetchReviewsFromAPI();
      setReviews(data.reviews.slice(0, MAX_REVIEWS));
      setRating(data.rating);
      setStatus("loaded");
      scheduleNextUpdate(loadReviews);
    } catch (err) {
      console.error("Fejl ved indlæsning af anmeldelser:", err);
      if (cachedReviewsRaw) {
        const cached: Review[] = JSON.parse(cachedReviewsRaw);
        setReviews(cached.slice(0, MAX_REVIEWS));
        setRating(cachedRating || "0.0");
        setStatus("loaded");
      } else {
        setStatus("error");
      }
    }
  }, [scheduleNextUpdate]);

  useEffect(() => {
    loadReviews(false);

    const handleVisibilityChange = () => {
      if (!document.hidden && shouldFetchReviews()) loadReviews(true);
    };
    const handleFocus = () => {
      if (shouldFetchReviews()) loadReviews(true);
    };
    const handleBeforeUnload = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [loadReviews]);

  const openReviewPage = () => {
    window.open(
      `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const roundedRating = Math.round(parseFloat(rating));

  return (
    <div style={styles.widget}>
      {/* Header */}
      {status === "loaded" && (
        <div style={styles.widgetHeader} className="widget-header-responsive">
          <div style={styles.ratingSection}>
            <GoogleLogoSVG className="google-logo" />
            <div style={styles.overallRating}>
              <span style={styles.ratingNumber}>{rating}</span>
              <div style={styles.ratingStars}>
                <Stars rating={roundedRating} size={20} />
                <span style={styles.reviewCount}>({reviews.length})</span>
              </div>
            </div>
          </div>
          <button style={styles.reviewButton} className="review-button-responsive" onClick={openReviewPage}>
            <EditableContent contentKey="google-reviews-anmeld-os-paa-google" fallback="Anmeld os på Google" />
          </button>
        </div>
      )}

      {/* Body */}
      {status === "loading" && <div style={styles.loading}><EditableContent contentKey="google-reviews-indlaeser-anmeldelser" fallback="Indlæser anmeldelser..." /></div>}
      {status === "error" && (
        <div style={styles.error}><EditableContent contentKey="google-reviews-kunne-ikke-indlaese-anmeldelser-proev" fallback="Kunne ikke indlæse anmeldelser. Prøv igen senere." /></div>
      )}
      {status === "loaded" && (
        <div style={styles.reviewsGrid} className="reviews-grid-responsive">
          {reviews.map((review, i) => (
            <ReviewCard key={i} review={review} index={i} />
          ))}
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        .google-logo { width: 32px; height: 32px; flex-shrink: 0; }
        @media (max-width: 1024px) {
          .reviews-grid-responsive { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .widget-header-responsive { flex-direction: column !important; align-items: flex-start !important; }
          .review-button-responsive { width: 100% !important; }
        }
        @media (max-width: 640px) {
          .reviews-grid-responsive { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  widget: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    backgroundColor: "#171717",
    padding: 24,
    borderRadius: 24,
  },
  widgetHeader: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 24,
    marginBottom: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  ratingSection: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  overallRating: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  ratingNumber: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "bold",
    lineHeight: 1,
  },
  ratingStars: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  reviewCount: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  reviewButton: {
    backgroundColor: "#000000",
    color: "#FFFFFF",
    padding: "12px 24px",
    borderRadius: 8,
    fontWeight: 500,
    fontSize: 14,
    border: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background-color 0.3s ease",
  },
  loading: {
    color: "#a1a1a1",
    textAlign: "center",
    padding: "48px 24px",
    fontSize: 16,
  },
  error: {
    color: "#EF4444",
    textAlign: "center",
    padding: "48px 24px",
    fontSize: 16,
  },
  reviewsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 24,
  },
  reviewCard: {
    backgroundColor: "#262626",
    borderRadius: 8,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
    transition: "box-shadow 0.3s ease",
    position: "relative",
  },
  googleIcon: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 24,
    height: 24,
    cursor: "pointer",
    opacity: 1,
    transition: "transform 0.2s ease",
  },
  reviewHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    backgroundColor: "#374151",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  userName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  localGuide: {
    color: "#60A5FA",
    fontSize: 12,
    fontWeight: 500,
    display: "inline-block",
  },
  reviewCountUser: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  ratingDate: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  date: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  reviewText: {
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 1.6,
  },
  truncated4: {
    display: "-webkit-box",
    WebkitLineClamp: 4,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as React.CSSProperties,
  truncated1: {
    display: "-webkit-box",
    WebkitLineClamp: 1,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as React.CSSProperties,
  showMoreBtn: {
    background: "none",
    border: "none",
    color: "#60A5FA",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    marginTop: 8,
    padding: 0,
    transition: "color 0.3s ease",
  },
  reviewImages: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
  },
  reviewImage: {
    width: 80,
    height: 80,
    objectFit: "cover",
    borderRadius: 4,
    flexShrink: 0,
  },
  likes: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  ownerResponse: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderLeft: "4px solid #3B82F6",
    borderRadius: 4,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  ownerResponseHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  ownerResponseTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 600,
  },
  ownerResponseDate: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  ownerResponseText: {
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 1.6,
    wordWrap: "break-word",
    overflowWrap: "break-word",
  },
};

export default GoogleReviews;

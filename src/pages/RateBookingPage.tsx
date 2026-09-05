import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Star, CheckCircle, AlertCircle, Calendar, Clock, MapPin } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { formatDate, formatTime } from '../utils/booking';
import EditableContent from '../components/EditableContent';
import RatingImageUpload from '../components/RatingImageUpload';
import toast from 'react-hot-toast';

interface BookingData {
  id: number;
  user_id: string;
  product_name: string;
  booking_date: string;
  booking_time: string;
  address: string;
  user_email: string;
  rating_token_expires_at: string;
}

const RateBookingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Rating form state
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const bookingId = searchParams.get('bookingId');
  const token = searchParams.get('token');

  useEffect(() => {
    if (!bookingId || !token) {
      setError('Manglende booking ID eller token');
      setLoading(false);
      return;
    }

    validateTokenAndLoadBooking();
  }, [bookingId, token]);

  const validateTokenAndLoadBooking = async () => {
    try {
      setLoading(true);

      // Call the edge function to fetch booking details
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-rating-booking-details`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          bookingId,
          token,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setError('Ugyldig eller udløbet link');
        } else if (response.status === 410) {
          setError('Dette link er udløbet');
        } else {
          setError(data.error || 'Der opstod en fejl ved validering af linket');
        }
        setLoading(false);
        return;
      }

      if (data.hasExistingRating) {
        setSubmitted(true);
      }

      setBooking(data.booking);
    } catch (err) {
      console.error('Error validating token:', err);
      setError('Der opstod en fejl ved validering af linket');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      toast.error('Vælg venligst en bedømmelse');
      return;
    }

    if (!booking) {
      toast.error('Booking data ikke tilgængelig');
      return;
    }

    try {
      setSubmitting(true);

      // Submit rating using the user_id from the booking data
      const { error: ratingError } = await supabase
        .from('ratings')
        .insert({
          booking_id: parseInt(bookingId!),
          user_id: booking.user_id,
          rating,
          comment: comment.trim() || null,
          images: images.length > 0 ? images : null,
        });

      if (ratingError) {
        throw ratingError;
      }

      // Invalidate the rating token
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          rating_access_token: null,
          rating_token_expires_at: null,
        })
        .eq('id', bookingId);

      if (updateError) {
        console.error('Error invalidating token:', updateError);
        // Don't throw here as the rating was successful
      }

      setSubmitted(true);
      toast.success('Tak for din bedømmelse!');

    } catch (err: any) {
      console.error('Error submitting rating:', err);
      toast.error(err.message || 'Der opstod en fejl ved indsendelse af bedømmelsen');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
          <p className="text-neutral-300"><EditableContent contentKey="rate-booking-page-validerer-link" fallback="Validerer link..." /></p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900">
        <div className="text-center max-w-md mx-auto px-6">
          <AlertCircle size={48} className="text-error mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-4"><EditableContent contentKey="rate-booking-page-ugyldig-link" fallback="Ugyldig Link" /></h1>
          <p className="text-neutral-300 mb-6">{error}</p>
          <button 
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            <EditableContent contentKey="rate-booking-page-gaa-til-forsiden" fallback="Gå til forsiden" />
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900">
        <div className="text-center max-w-md mx-auto px-6">
          <CheckCircle size={48} className="text-success mx-auto mb-4" />
          <EditableContent
            contentKey="rate-booking-success-title"
            as="h1"
            className="text-2xl font-bold text-white mb-4"
            fallback="Tak for din bedømmelse!"
          />
          <EditableContent
            contentKey="rate-booking-success-message"
            as="p"
            className="text-neutral-300 mb-6"
            fallback="Din bedømmelse er blevet gemt. Vi sætter stor pris på din feedback!"
          />
          <button 
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            <EditableContent
              contentKey="rate-booking-go-home-button"
              fallback="Gå til forsiden"
            />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 py-12">
      <div className="container max-w-2xl mx-auto">
        <div className="bg-neutral-800 rounded-xl shadow-lg overflow-hidden border border-neutral-700">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-primary-dark p-6 text-white">
            <EditableContent
              contentKey="rate-booking-page-title"
              as="h1"
              className="text-2xl font-bold mb-2"
              fallback="Bedøm din oplevelse"
            />
            <EditableContent
              contentKey="rate-booking-page-subtitle"
              as="p"
              className="opacity-90"
              fallback="Vi vil gerne høre om din oplevelse med vores service"
            />
          </div>

          {/* Booking Details */}
          {booking && (
            <div className="p-6 border-b border-neutral-700">
              <EditableContent
                contentKey="rate-booking-details-title"
                as="h3"
                className="text-lg font-semibold text-white mb-4"
                fallback="Booking Detaljer"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start">
                  <Calendar size={18} className="text-primary mr-2 mt-0.5" />
                  <div>
                    <div className="text-sm text-neutral-400"><EditableContent contentKey="rate-booking-page-service" fallback="Service" /></div>
                    <div className="text-neutral-100">{booking.product_name}</div>
                  </div>
                </div>

                <div className="flex items-start">
                  <Clock size={18} className="text-primary mr-2 mt-0.5" />
                  <div>
                    <div className="text-sm text-neutral-400"><EditableContent contentKey="rate-booking-page-dato-tid" fallback="Dato & Tid" /></div>
                    <div className="text-neutral-100">
                      {formatDate(booking.booking_date)} <EditableContent contentKey="rate-booking-page-kl" fallback="kl." /> {formatTime(booking.booking_time)}
                    </div>
                  </div>
                </div>

                <div className="flex items-start md:col-span-2">
                  <MapPin size={18} className="text-primary mr-2 mt-0.5" />
                  <div>
                    <div className="text-sm text-neutral-400"><EditableContent contentKey="rate-booking-page-lokation" fallback="Lokation" /></div>
                    <div className="text-neutral-100">{booking.address}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rating Form */}
          <form onSubmit={handleSubmitRating} className="p-6">
            {/* Star Rating */}
            <div className="mb-6">
              <EditableContent
                contentKey="rate-booking-rating-label"
                as="label"
                className="block text-sm font-medium text-neutral-300 mb-3"
                fallback="Hvor tilfreds var du med servicen?"
              />
              <div className="flex items-center space-x-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`p-1 transition-colors ${
                      star <= rating ? 'text-yellow-400' : 'text-neutral-500 hover:text-yellow-300'
                    }`}
                  >
                    <Star size={32} fill={star <= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-sm text-neutral-400 mt-2">
                  {rating === 1 && 'Meget utilfreds'}
                  {rating === 2 && 'Utilfreds'}
                  {rating === 3 && 'Neutral'}
                  {rating === 4 && 'Tilfreds'}
                  {rating === 5 && 'Meget tilfreds'}
                </p>
              )}
            </div>

            {/* Comment */}
            <div className="mb-6">
              <EditableContent
                contentKey="rate-booking-comment-label"
                as="label"
                className="block text-sm font-medium text-neutral-300 mb-2"
                fallback="Kommentar (valgfri)"
              />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="form-input"
                placeholder="Fortæl os om din oplevelse..."
              />
            </div>

            {/* Image Upload */}
            <div className="mb-6">
              <EditableContent
                contentKey="rate-booking-images-label"
                as="label"
                className="block text-sm font-medium text-neutral-300 mb-2"
                fallback="Billeder (valgfri, maks 4)"
              />
              
              <RatingImageUpload
                images={images}
                onImagesChange={setImages}
                maxImages={4}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={rating === 0 || submitting}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  <EditableContent contentKey="rate-booking-page-sender" fallback="Sender..." />
                </div>
              ) : (
                <EditableContent
                  contentKey="rate-booking-submit-button"
                  fallback="Send Bedømmelse"
                />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RateBookingPage;
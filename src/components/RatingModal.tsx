import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '../utils/supabase';
import RatingImageUpload from './RatingImageUpload';
import toast from 'react-hot-toast';

interface RatingModalProps {
  bookingId: number;
  onClose: () => void;
  onRatingSubmitted: () => void;
}

const RatingModal: React.FC<RatingModalProps> = ({ bookingId, onClose, onRatingSubmitted }) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error('Vælg venligst en bedømmelse');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('ratings')
        .insert([
          {
            booking_id: bookingId,
            rating,
            comment: comment.trim() || null,
            images
          }
        ]);

      if (error) throw error;

      toast.success('Tak for din bedømmelse!');
      onRatingSubmitted();
      onClose();
    } catch (err) {
      console.error('Error submitting rating:', err);
      toast.error('Der opstod en fejl ved indsendelse af bedømmelsen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-neutral-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-neutral-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Bedøm din oplevelse</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Din bedømmelse
            </label>
            <div className="flex space-x-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="focus:outline-none"
                  onMouseEnter={() => setHoveredRating(value)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(value)}
                >
                  <Star
                    size={32}
                    className={`${
                      (hoveredRating || rating) >= value
                        ? 'text-yellow-400 fill-current'
                        : 'text-neutral-600'
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-neutral-300 mb-2">
              Kommentar (valgfrit)
            </label>
            <textarea
              id="comment"
              rows={4}
              className="form-input resize-none"
              placeholder="Fortæl os om din oplevelse..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Billeder (valgfrit)
            </label>
            <RatingImageUpload
              images={images}
              onImagesChange={setImages}
              maxImages={4}
            />
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={loading}
            >
              Annuller
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || rating === 0}
            >
              {loading ? 'Sender...' : 'Send bedømmelse'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RatingModal;
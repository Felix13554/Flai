import React from 'react';
import { Star, StarHalf } from 'lucide-react';

interface RatingStarsProps {
  rating: number;
  size?: number;
}

const RatingStars: React.FC<RatingStarsProps> = ({ rating, size = 20 }) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  
  return (
    <div className="flex items-center">
      {[...Array(fullStars)].map((_, i) => (
        <Star
          key={`full-${i}`}
          size={size}
          className="text-yellow-400 fill-current"
        />
      ))}
      {hasHalfStar && (
        <StarHalf
          size={size}
          className="text-yellow-400 fill-current"
        />
      )}
      {[...Array(5 - fullStars - (hasHalfStar ? 1 : 0))].map((_, i) => (
        <Star
          key={`empty-${i}`}
          size={size}
          className="text-neutral-600"
        />
      ))}
    </div>
  );
};

export default RatingStars;
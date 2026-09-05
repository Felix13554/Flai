export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: 'photo' | 'video';
  images: string[];
  links?: Array<{
    title: string;
    url: string;
  }>;
  is_exclusive_to_business: boolean;
  is_editing_included: boolean;
  created_at: string;
  array: number; // New field for ordering products
}

export interface Booking {
  id: number;
  user_id?: string | null;
  product_id: number;
  booking_date: string;
  booking_time: string;
  address: string;
  include_editing: boolean;
  payment_status: string;
  payment_method?: string;
  payment_intent_id?: string;
  is_completed: boolean;
  created_at: string;
  deleted_at?: string;
  discount_code_id?: string;
  discount_amount?: number;
  original_price?: number;
  price?: number;
  zip_file_url?: string;
  rating_access_token?: string;
  rating_token_expires_at?: string;
  credits_used?: number;
  guest_email?: string | null;
}

export interface BookingWithProduct extends Booking {
  user_email: string;
  product_name: string;
}

export interface AddressZone {
  id: string;
  name: string;
  center_address: string;
  radius_km: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PortfolioImage {
  id: string;
  title: string;
  image_url: string;
  description?: string | null;
  likes: number;
  dislikes: number;
  user_reaction?: 'like' | 'dislike' | null;
  created_at: string;
  updated_at: string;
  array?: number;
  bundle_id?: string | null;
  sort_order?: number;
  image_name?: string | null;
  business_logo_url?: string | null;
  business_website_url?: string | null;
}

export interface ClientLogo {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Updated BookingConfig interface to reflect the new unified schema
export interface BookingConfig {
  id: string;
  type: 'weekly' | 'specific_date';
  day_name?: BookingDay | null; // Nullable, used for 'weekly' type
  date_override?: string | null; // For 'specific_date' type
  is_enabled: boolean;
  start_time: string;
  end_time: string;
  reason?: string | null; // Reason for specific overrides
  priority: number; // Priority for resolving conflicts
  created_at: string;
  updated_at: string;
}

export type BookingDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface BookingTimeRange {
  day: BookingDay;
  start: string;
  end: string;
  enabled: boolean;
}

export interface TimeSlot {
  id: string;
  date: string;
  time: string;
  available: boolean;
  category?: 'night' | 'sunrise' | 'daytime' | 'sunset';
}

export interface DiscountCode {
  id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_uses?: number;
  current_uses: number;
  is_active: boolean;
  valid_from: string;
  valid_until?: string;
  created_at: string;
  updated_at: string;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  created_at: string;
}

export interface Newsletter {
  id: string;
  title: string;
  content: string;
  sent_at: string;
}

export interface NewsletterTemplate {
  id: string;
  name: string;
  template_data: any;
  created_at: string;
  updated_at: string;
}

export interface CreditPackage {
  credits: number;
  price: number;
  name: string;
  popular?: boolean;
}

export interface DonationLink {
  id: string;
  slug: string;
  title: string;
  description: string;
  is_active: boolean;
  min_amount: number;
  max_amount?: number;
  goal_amount?: number;
  total_collected: number;
  donation_count: number;
  currency: string;
  end_date?: string;
  thank_you_message?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PreviewLink {
  id: string;
  type: 'video' | 'photos';
  drive_id: string | null;
  youtube_id: string | null;
  is_folder: boolean;
  title: string;
  is_active: boolean;
  view_count: number;
  last_viewed_at?: string;
  created_by?: string;
  created_at: string;
}

export interface Donation {
  id: string;
  donation_link_id: string;
  amount: number;
  payment_status: string;
  payment_intent_id?: string;
  created_at: string;
}

declare module 'virtual:content-keys' {
  export interface ContentKeyEntry {
    key: string;
    fallback: string;
    type: 'editableContent' | 'getContent';
    file: string;
  }
  export const CONTENT_KEYS: ContentKeyEntry[];
}

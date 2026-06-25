import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your environment. ' +
    'For local development, add them to .env file. For Netlify deployment, configure them in Site Settings > Environment variables.'
  );
}

// In support mode (admin opened this window via the Support button),
// use sessionStorage so this window has a completely isolated auth state
// that never bleeds into the admin's localStorage session.
const isSupportMode =
  typeof window !== 'undefined' &&
  window.sessionStorage.getItem('support-mode') === '1';

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      flowType: 'pkce', // required for exchangeCodeForSession in AuthCallback
      persistSession: true,
      storage: typeof window !== 'undefined'
        ? (isSupportMode ? window.sessionStorage : window.localStorage)
        : undefined,
      storageKey: isSupportMode ? 'support-session' : 'sb-auth-token',
      autoRefreshToken: true,
      detectSessionInUrl: !isSupportMode, // don't process URL tokens in admin window
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

// Function to upload image to Supabase Storage
export const uploadImage = async (file: File, bucket: string = 'product-images'): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
};

export { supabaseUrl };

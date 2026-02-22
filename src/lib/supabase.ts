import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file');
}

/**
 * The canonical site URL used for OAuth redirects.
 * Set VITE_SITE_URL to your deployed URL (e.g. https://app.corduroy.ai).
 * Falls back to window.location.origin for local development.
 */
export const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    autoRefreshToken: true,
    persistSession: true,
  },
});






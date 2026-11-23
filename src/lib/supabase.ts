import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = () => {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || 'https://utclrjbfrwixqqzxwreu.supabase.co';
  const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0Y2xyamJmcndpeHFxenh3cmV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Mzg5NDQsImV4cCI6MjA5MDAxNDk0NH0.d6H0lYFWXRH6kC-4EoiyiefVCLjpcX9OnYaMkdliLXo';

  if (!supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_ANON_KEY is required to use the shopping list. Please set it in your environment variables.');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
};

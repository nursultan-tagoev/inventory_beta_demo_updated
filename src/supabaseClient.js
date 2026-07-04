import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('Supabase env не заданы. Укажите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в Vercel.')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'placeholder')

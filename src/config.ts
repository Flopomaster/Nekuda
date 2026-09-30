// Public values only: the publishable key and VAPID public key are safe to ship to the browser.
// Access to data is protected by Row Level Security in Supabase.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://yqbdbgkowlwwxiikdzcx.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_3HP2JA9z0BwheUWxmEqLvA_2XNk3SnO'
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ??
  'BP8RZBUET8sWZhJLatk72zRtBALSK-QZb2D3CIuUn3wLVSIk6QhFS6tEOuNdc-hwgPCGJpZJXOf2o_C8BUUi8iw'

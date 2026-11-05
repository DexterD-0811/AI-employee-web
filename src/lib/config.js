// Where Agent HQ finds the shared workspace. The publishable key is meant to be
// public: row-level security only lets owners (hq_owners) read anything, and owners
// change things only through the hq_decide and hq_set_paused functions.
// Override both with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in a .env file.

const env = import.meta.env || {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://zyhmbbewqmplceycarfr.supabase.co';
export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_YKFUTfs_8avMHwUSzY9dIQ_nWFwcBhM';

// how often the office checks for new work while the tab is open
export const POLL_MS = 30000;

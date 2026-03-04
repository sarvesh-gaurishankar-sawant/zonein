import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qhdwdstxawnuovqqnfwu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4gKQ92UZ4PApvbC0joCnaw_XNVHQh5-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

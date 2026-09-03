import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** 数据库类型来源见 src/types/database.ts（手写，事实来源 supabase-migration.sql） */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
export default supabase;

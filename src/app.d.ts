import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '$db/schema';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			user: { id: string; email: string } | null;
			profile: Profile | null;
			/** true bila sesi berasal dari jalur lokal pengembangan. */
			devSession: boolean;
		}
		interface PageData {
			profile?: Profile | null;
		}
	}
}

export {};

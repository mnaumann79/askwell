import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The service client (docs/project.md §7, §9).
 *
 * It uses `SUPABASE_SECRET_KEY`, which acts as `service_role` and skips RLS.
 * Server only: the secret key is read here and nowhere else.
 *
 * Use it after the route has checked ownership and the plan — visitor routes,
 * the Clerk webhook, knowledge processing, Storage. Owner reads go through the
 * owner client instead, so RLS scopes them.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  }

  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not set.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

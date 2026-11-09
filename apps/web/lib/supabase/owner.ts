import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The owner client (docs/project.md §7, §9).
 *
 * It sends the owner's Clerk session token, so Postgres RLS decides what the
 * owner may read. Supabase accepts the Clerk token as third-party auth.
 *
 * Never the service key here. The service client skips RLS and is only for
 * writes the owner is not allowed to make and for server-only work.
 *
 * The client carries the owner's session, so create it per request and never
 * cache it or reuse it across requests.
 */
export async function createOwnerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  }

  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.");
  }

  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    throw new Error("No signed-in user: the Clerk session token is missing.");
  }

  return createClient(url, key, {
    // supabase-js sends this as the `Authorization: Bearer` header on every
    // request, so RLS sees the Clerk token and scopes the owner to their own
    // rows. The token is fetched per request: a token captured once expires and
    // the client would then fail with an opaque 401.
    accessToken: async () => (await getToken()) ?? "",
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

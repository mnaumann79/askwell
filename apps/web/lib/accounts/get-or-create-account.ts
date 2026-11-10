import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerClient } from "../supabase/owner";
import { createServiceClient } from "../supabase/service";
import type { Account } from "./types";

/**
 * The columns of the `accounts` row the dashboard reads (docs/project.md §7).
 */
const ACCOUNT_COLUMNS = "clerk_user_id, plan, created_at";

type AccountRow = {
  clerk_user_id: string;
  plan: string;
  created_at: string;
};

function isAccountRow(value: unknown): value is AccountRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.clerk_user_id === "string" &&
    typeof row.plan === "string" &&
    typeof row.created_at === "string"
  );
}

function toAccount(row: unknown): Account {
  if (!isAccountRow(row)) {
    throw new Error("The account row is not the shape we expect.");
  }

  if (row.plan !== "free" && row.plan !== "pro") {
    throw new Error(`Unknown plan: ${row.plan}`);
  }

  return {
    clerkUserId: row.clerk_user_id,
    plan: row.plan,
    createdAt: row.created_at,
  };
}

/**
 * Reads the owner's own account row.
 *
 * The owner client carries the Clerk session token, so RLS scopes the read to
 * the signed-in owner and no other account is reachable (docs/project.md §7,
 * §9).
 */
async function readAccount(client: SupabaseClient, clerkUserId: string): Promise<Account | null> {
  const { data, error } = await client
    .from("accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read the account: ${error.message}`);
  }

  return data === null ? null : toAccount(data);
}

/**
 * Returns the owner's account, creating it on first sign-in
 * (docs/project.md §6.2).
 *
 * The Clerk user id comes from the server session — the dashboard passes the
 * id that `auth.protect()` returned — so the row is never created from
 * anything the browser sends (§9).
 *
 * The read goes through the owner client, so RLS scopes it to the signed-in
 * owner. The write goes through the service client: `authenticated` has no
 * INSERT on `accounts` (§7), and creating one's own account row is one of
 * the writes an owner cannot make. The service client is used on the server,
 * after the route has checked the session.
 */
export async function getOrCreateAccount(clerkUserId: string): Promise<Account> {
  if (!clerkUserId) {
    throw new Error("getOrCreateAccount needs a Clerk user id");
  }

  const owner = await createOwnerClient();

  const existing = await readAccount(owner, clerkUserId);
  if (existing) {
    return existing;
  }

  // The row does not exist yet. The upsert is idempotent: on the primary key
  // it does nothing, so two simultaneous first requests cannot create two
  // rows, and an account that is already on the `pro` plan is never written
  // back to `free`.
  const { data, error } = await createServiceClient()
    .from("accounts")
    .upsert(
      { clerk_user_id: clerkUserId, plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    )
    .select(ACCOUNT_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not create the account: ${error.message}`);
  }

  if (data !== null) {
    return toAccount(data);
  }

  // Another request created the row between our read and our write. The row
  // is the owner's own, so read it back through the owner client.
  const created = await readAccount(owner, clerkUserId);
  if (!created) {
    throw new Error("The account was not created.");
  }

  return created;
}

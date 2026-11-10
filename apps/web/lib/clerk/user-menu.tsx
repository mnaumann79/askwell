"use client";

import { UserButton } from "@clerk/nextjs";

/**
 * The owner's account menu.
 *
 * A client component because Clerk's `UserButton` needs the browser. Signing
 * out goes to `/sign-in`, set once on the `ClerkProvider` in the root layout.
 */
export function UserMenu() {
  return <UserButton />;
}

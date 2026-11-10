import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { DashboardNav } from "../../components/dashboard-nav";
import { SIGN_IN_URL } from "../../lib/clerk/urls";

/**
 * The dashboard shell (docs/project.md §6.2, §13).
 *
 * `theme-light` swaps the shared tokens to their light values, so the
 * dashboard is light and monochrome while the landing page stays dark.
 *
 * The check is here because the layout wraps every dashboard page. The page
 * below checks again for itself: Next.js does not always re-render a layout
 * when the page under it changes.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await auth.protect({ unauthenticatedUrl: SIGN_IN_URL });

  return (
    <div className="theme-light flex min-h-dvh flex-col bg-background text-foreground">
      <DashboardNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

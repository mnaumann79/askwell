import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { UserMenu } from "../lib/clerk/user-menu";
import { DASHBOARD_URL } from "../lib/clerk/urls";
import { DashboardNavSections } from "./dashboard-nav-sections";

/**
 * The dashboard shell: the app name, the sections and the owner's account
 * menu (docs/project.md §13).
 *
 * The shell is a server component. The sections are a small client part
 * beside it, because the section the owner is on is read from the pathname —
 * and a server component cannot read it.
 */
export function DashboardNav() {
  return (
    <header className="border-b border-border bg-surface backdrop-blur-glass">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={DASHBOARD_URL}
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            {APP_NAME}
          </Link>
          <UserMenu />
        </div>

        <DashboardNavSections />
      </div>
    </header>
  );
}

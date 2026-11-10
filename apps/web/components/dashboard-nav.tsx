import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { UserMenu } from "../lib/clerk/user-menu";
import { DASHBOARD_URL } from "../lib/clerk/urls";

/**
 * A dashboard section. `href` is set once the section has a page of its own,
 * which happens in the later phases of docs/plan.md.
 */
type NavSection = {
  label: string;
  href?: string;
  /** The section the owner is looking at right now. */
  current?: boolean;
};

const SECTIONS: NavSection[] = [
  { label: "Overview", href: DASHBOARD_URL, current: true },
  { label: "Projects" },
  { label: "Knowledge" },
  { label: "Conversations" },
  { label: "Customize" },
  { label: "Install" },
  { label: "Billing" },
  { label: "Usage" },
];

/**
 * The dashboard shell: the app name, the sections and the owner's account
 * menu (docs/project.md §13).
 *
 * The sections that have no page yet are rendered as plain text, so nothing
 * in the app links to a route that would 404.
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

        <nav aria-label="Dashboard sections">
          <ul className="flex flex-wrap items-center gap-x-1 gap-y-2">
            {SECTIONS.map((section) => (
              <li key={section.label}>
                {section.href ? (
                  <Link
                    href={section.href}
                    aria-current={section.current ? "page" : undefined}
                    className="inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-strong"
                  >
                    {section.label}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-muted"
                  >
                    {section.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Projects, knowledge and the rest arrive with the next phases.
          </p>
        </nav>
      </div>
    </header>
  );
}

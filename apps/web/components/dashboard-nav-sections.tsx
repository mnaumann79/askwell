"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DASHBOARD_URL } from "../lib/clerk/urls";

/**
 * A dashboard section. `href` is set once the section has a page of its own,
 * which happens in the later phases of docs/plan.md.
 */
export type NavSection = {
  label: string;
  href?: string;
};

/**
 * The sections, in one place.
 *
 * A later task that gives a section a page of its own changes this array and
 * nothing else.
 */
export const SECTIONS: NavSection[] = [
  { label: "Overview", href: DASHBOARD_URL },
  { label: "Projects", href: `${DASHBOARD_URL}/projects` },
  { label: "Knowledge" },
  { label: "Conversations" },
  { label: "Customize" },
  { label: "Install", href: `${DASHBOARD_URL}/install` },
  { label: "Billing" },
  { label: "Usage" },
];

/**
 * The section the pathname is in.
 *
 * The marker is `aria-current="page"`: it says to a screen reader which page
 * this is (§13). A colour would be the styling on top of it, never the
 * statement itself.
 */
export function currentSection(pathname: string): NavSection | null {
  return SECTIONS.find((section) => section.href === pathname) ?? null;
}

/**
 * The link of a section.
 *
 * The one the owner is on gets a fill as well as the marker: `aria-current` is
 * the statement, and a sighted owner has to see it too. The dashboard is light
 * and monochrome (§13), so the fill is a grey and nothing else.
 */
const LINK_CLASS =
  "inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-foreground transition-colors";

/**
 * The sections, with the one the owner is on marked.
 *
 * The pathname comes in as a prop, so the list can be rendered without a
 * router — which is what the test does.
 */
export function NavSections({ pathname }: { pathname: string }) {
  const current = currentSection(pathname);

  return (
    <nav aria-label="Dashboard sections">
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {SECTIONS.map((section) => (
          <li key={section.label}>
            {section.href ? (
              <Link
                href={section.href}
                aria-current={current?.label === section.label ? "page" : undefined}
                className={
                  current?.label === section.label
                    ? `${LINK_CLASS} bg-border hover:bg-border`
                    : `${LINK_CLASS} hover:bg-surface-strong`
                }
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
  );
}

/**
 * The sections, as the shell renders them: the pathname comes from the router.
 */
export function DashboardNavSections() {
  const pathname = usePathname();

  return <NavSections pathname={pathname} />;
}

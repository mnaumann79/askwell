import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk's request-level middleware (docs/project.md §6.2).
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`; the file
 * lives next to `app/` and keeps the same `config.matcher` block.
 *
 * This only lets Clerk read the session. It does not decide which routes
 * need a signed-in user — that check lives where the data is, in the
 * dashboard layout and page, with `auth.protect()`. `createRouteMatcher` is
 * deprecated in `@clerk/nextjs` 7 and is deliberately not used.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Everything except Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // API routes need the session too, so `auth()` works there.
    "/(api|trpc)(.*)",
  ],
};

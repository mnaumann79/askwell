import { SignIn } from "@clerk/nextjs";
import { DASHBOARD_URL, SIGN_UP_URL } from "../../../lib/clerk/urls";

/**
 * Clerk's sign-in page (docs/project.md §6.2).
 *
 * The catch-all route is Clerk's own convention: it lets Clerk handle its
 * own sub-routes. Email + password and Google are enabled on the Clerk
 * instance, not here.
 *
 * `fallbackRedirectUrl` sends a signed-in owner to the dashboard.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <SignIn signUpUrl={SIGN_UP_URL} fallbackRedirectUrl={DASHBOARD_URL} />
    </main>
  );
}

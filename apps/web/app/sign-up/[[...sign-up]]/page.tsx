import { SignUp } from "@clerk/nextjs";
import { DASHBOARD_URL, SIGN_IN_URL } from "../../../lib/clerk/urls";

/**
 * Clerk's sign-up page (docs/project.md §6.2).
 *
 * Email + password and Google are enabled on the Clerk instance, not here.
 *
 * `fallbackRedirectUrl` sends a new owner straight to the dashboard, which
 * is where the `accounts` row is created on first sign-in.
 */
export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <SignUp signInUrl={SIGN_IN_URL} fallbackRedirectUrl={DASHBOARD_URL} />
    </main>
  );
}

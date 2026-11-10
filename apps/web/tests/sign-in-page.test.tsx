import { describe, expect, it, vi } from "vitest";
import { renderToHtml } from "./render-to-html";

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: { signUpUrl?: string; fallbackRedirectUrl?: string }) => (
    <div
      data-testid="clerk-sign-in"
      data-sign-up-url={props.signUpUrl}
      data-fallback-redirect-url={props.fallbackRedirectUrl}
    />
  ),
}));

import SignInPage from "../app/sign-in/[[...sign-in]]/page";

describe("sign-in page", () => {
  it("renders Clerk's sign-in component", async () => {
    const html = await renderToHtml(<SignInPage />);

    expect(html).toContain('data-testid="clerk-sign-in"');
  });

  it("links to the sign-up page and lands on the dashboard", async () => {
    const html = await renderToHtml(<SignInPage />);

    expect(html).toContain('data-sign-up-url="/sign-up"');
    expect(html).toContain('data-fallback-redirect-url="/dashboard"');
  });
});

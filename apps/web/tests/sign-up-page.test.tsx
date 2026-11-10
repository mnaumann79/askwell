import { describe, expect, it, vi } from "vitest";
import { renderToHtml } from "./render-to-html";

vi.mock("@clerk/nextjs", () => ({
  SignUp: (props: { signInUrl?: string; fallbackRedirectUrl?: string }) => (
    <div
      data-testid="clerk-sign-up"
      data-sign-in-url={props.signInUrl}
      data-fallback-redirect-url={props.fallbackRedirectUrl}
    />
  ),
}));

import SignUpPage from "../app/sign-up/[[...sign-up]]/page";

describe("sign-up page", () => {
  it("renders Clerk's sign-up component", async () => {
    const html = await renderToHtml(<SignUpPage />);

    expect(html).toContain('data-testid="clerk-sign-up"');
  });

  it("links to the sign-in page and lands on the dashboard", async () => {
    const html = await renderToHtml(<SignUpPage />);

    expect(html).toContain('data-sign-in-url="/sign-in"');
    expect(html).toContain('data-fallback-redirect-url="/dashboard"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StateMessage } from "./state-message";

describe("StateMessage", () => {
  it("shows an empty state", () => {
    const html = renderToStaticMarkup(<StateMessage tone="empty" title="Nothing here yet" />);

    expect(html).toContain('data-state="empty"');
    expect(html).toContain("Nothing here yet");
  });

  it("shows a loading state", () => {
    const html = renderToStaticMarkup(<StateMessage tone="loading" title="Writing…" />);

    expect(html).toContain('data-state="loading"');
    expect(html).toContain('role="status"');
  });

  it("shows an error state", () => {
    const html = renderToStaticMarkup(<StateMessage tone="error" title="Try again later" />);

    expect(html).toContain('data-state="error"');
    expect(html).toContain('role="alert"');
  });

  it("shows the description when there is one", () => {
    const html = renderToStaticMarkup(
      <StateMessage tone="empty" title="Nothing here yet" description="Ask a question." />,
    );

    expect(html).toContain("Ask a question.");
  });
});

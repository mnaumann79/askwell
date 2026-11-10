import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageList } from "./panel";

describe("the panel's message list", () => {
  it("shows the empty state when there is nothing yet", () => {
    const html = renderToStaticMarkup(<MessageList messages={[]} typing={false} />);

    expect(html).toContain('data-state="empty"');
    expect(html).toContain("Ask a question");
  });

  it("shows the messages", () => {
    const html = renderToStaticMarkup(
      <MessageList
        messages={[
          { role: "visitor", text: "Does it work on my website?" },
          { role: "bot", text: "Yes." },
        ]}
        typing={false}
      />,
    );

    expect(html).toContain("Does it work on my website?");
    expect(html).toContain("Yes.");
    expect(html).toContain('data-role="visitor"');
    expect(html).toContain('data-role="bot"');
  });

  it("renders the messages as text, never as markup", () => {
    const html = renderToStaticMarkup(
      <MessageList
        messages={[{ role: "visitor", text: "<img src=x onerror=alert(1)>" }]}
        typing={false}
      />,
    );

    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
  });

  it("shows the typing state", () => {
    const html = renderToStaticMarkup(<MessageList messages={[]} typing />);

    expect(html).toContain("data-typing");
  });
});

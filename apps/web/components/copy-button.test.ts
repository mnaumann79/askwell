import { describe, expect, it } from "vitest";
import { copyText } from "./copy-button";

const SNIPPET = `<script src="https://askwell.example/widget.js" data-key="pk_aaa"></script>`;

describe("copyText", () => {
  it("writes the text it is given", async () => {
    const written: string[] = [];

    await copyText(SNIPPET, async (text) => {
      written.push(text);
    });

    expect(written).toEqual([SNIPPET]);
  });

  it("comes back as a failure when the write is refused", async () => {
    await expect(
      copyText(SNIPPET, async () => {
        throw new Error("The clipboard is not available.");
      }),
    ).rejects.toThrow("The clipboard is not available.");
  });
});

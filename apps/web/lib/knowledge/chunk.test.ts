import { describe, expect, it } from "vitest";
import { OVERLAP_CHARACTERS, TARGET_CHUNK_CHARACTERS, chunkText } from "./chunk";

/** A paragraph of about `length` characters, made of whole words. */
function paragraph(length: number, seed = "word"): string {
  const words: string[] = [];
  let size = 0;
  let index = 0;

  while (size < length) {
    const word = `${seed}${index}`;

    words.push(word);
    size += word.length + 1;
    index += 1;
  }

  return words.join(" ");
}

/** The words of a text. */
function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((word) => word.length > 0);
}

describe("chunkText", () => {
  it("keeps a short text in one chunk", () => {
    expect(chunkText("One.\n\nTwo.")).toEqual(["One.\n\nTwo."]);
  });

  it("returns nothing for a text without a word", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("splits a long text into chunks of at most the target size", () => {
    const chunks = chunkText(paragraph(5000));

    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHUNK_CHARACTERS);
    }
  });

  it("gives the next chunk the tail of the one before it", () => {
    const chunks = chunkText(paragraph(5000));
    const overlap = chunks[1]?.split("\n\n")[0] ?? "";

    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.length).toBeLessThanOrEqual(OVERLAP_CHARACTERS);
    expect(chunks[0]?.endsWith(overlap)).toBe(true);
  });

  it("splits at a paragraph boundary", () => {
    const text = [paragraph(500, "a"), paragraph(500, "b"), paragraph(500, "c")].join("\n\n");
    const paragraphs = text.split("\n\n");

    for (const chunk of chunkText(text)) {
      for (const part of chunk.split("\n\n")) {
        // A part is a paragraph of the text, or the tail of one: the
        // overlap is the tail of the paragraph the chunk before it ended
        // with.
        const whole = paragraphs.includes(part);
        const tail = paragraphs.some((candidate) => candidate.endsWith(part));

        expect(whole || tail).toBe(true);
      }
    }
  });

  it("never begins or ends in the middle of a word", () => {
    const text = paragraph(5000);
    const words = new Set(wordsOf(text));

    for (const chunk of chunkText(text)) {
      for (const word of wordsOf(chunk)) {
        expect(words.has(word)).toBe(true);
      }
    }
  });

  it("keeps every paragraph of the text", () => {
    const text = [paragraph(300, "a"), paragraph(300, "b"), paragraph(300, "c")].join("\n\n");
    const chunks = chunkText(text);

    for (const candidate of text.split("\n\n")) {
      expect(chunks.some((chunk) => chunk.includes(candidate))).toBe(true);
    }
  });

  it("splits a paragraph that is longer than a chunk between the words", () => {
    const text = paragraph(3000);
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHUNK_CHARACTERS);
    }
  });

  it("keeps a word that is longer than a chunk whole", () => {
    const word = "x".repeat(TARGET_CHUNK_CHARACTERS + 300);

    expect(chunkText(word)).toEqual([word]);
  });

  it("never begins a chunk in the middle of a long word", () => {
    // The overlap of the second chunk would be the last 200 characters of the
    // long word: a chunk may not begin in the middle of a word, so there is
    // no overlap.
    const chunks = chunkText(`${"x".repeat(TARGET_CHUNK_CHARACTERS + 1)} y`);

    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toBe("y");
  });

  it("keeps an overlap that begins at a word boundary", () => {
    // The last word of the first chunk is exactly as long as the overlap, so
    // the overlap is the whole word and not a part of it.
    const first = `${"z".repeat(700)} ${"q".repeat(OVERLAP_CHARACTERS)}`;
    const chunks = chunkText(`${first}\n\n${"b".repeat(400)}`);

    expect(chunks).toHaveLength(2);
    expect(chunks[1]?.startsWith("q".repeat(OVERLAP_CHARACTERS))).toBe(true);
  });

  it("reads the line endings of the text as they are", () => {
    const chunks = chunkText("One.\r\n\r\nTwo.");

    expect(chunks).toEqual(["One.\n\nTwo."]);
  });
});

/**
 * The chunking rule (docs/project.md §6.4).
 *
 * A source is split into chunks of about 1,200 characters, and every chunk
 * after the first begins with the last about 200 characters of the chunk
 * before it. The overlap is what keeps a sentence whole: a sentence that
 * straddles a boundary is in both chunks, so the retrieval finds it whole.
 *
 * The rule is the character count. There is no tokenizer and no dependency:
 * the chunks are measured in characters, because that is what the rule says.
 *
 * A chunk breaks at a paragraph boundary - a blank line - and never begins or
 * ends in the middle of a word.
 */

/** The size of a chunk, in characters. */
export const TARGET_CHUNK_CHARACTERS = 1200;

/** How much of the chunk before it the next chunk begins with. */
export const OVERLAP_CHARACTERS = 200;

/** The blank line between two paragraphs. */
const PARAGRAPH_BREAK = /\n[ \t]*\n+/;

/** The characters between two words. */
const WHITESPACE = /\s/;

/**
 * The size of a block: what is left of a chunk for the text itself.
 *
 * Every chunk after the first begins with the overlap and the blank line
 * that follows it, so a block has to fit in what is left.
 */
const BLOCK_CHARACTERS = TARGET_CHUNK_CHARACTERS - OVERLAP_CHARACTERS - 2;

/** The paragraphs of the text: the blocks between the blank lines. */
function paragraphsOf(text: string): string[] {
  return text
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** The index after the last run of whitespace in the text, or 0. */
function lastWhitespaceEnd(text: string): number {
  let end = 0;

  for (const match of text.matchAll(/\s+/g)) {
    end = match.index + match[0].length;
  }

  return end;
}

/** The index of the first whitespace at or after the start, or -1. */
function nextWhitespaceIndex(text: string, start: number): number {
  const match = WHITESPACE.exec(text.slice(start));

  return match === null ? -1 : start + match.index;
}

/**
 * Splits a paragraph that is longer than a block into pieces that are not.
 *
 * The pieces break between the words, so no word is cut in half. A word that
 * is longer than a block cannot be cut without breaking the rule, so it
 * stays whole and makes a block of its own.
 */
function splitParagraph(paragraph: string): string[] {
  if (paragraph.length <= BLOCK_CHARACTERS) {
    return [paragraph];
  }

  const pieces: string[] = [];
  let rest = paragraph;

  while (rest.length > BLOCK_CHARACTERS) {
    // The cut is at the last whitespace before the limit: the word that
    // crosses the limit goes to the next piece whole.
    const cut = lastWhitespaceEnd(rest.slice(0, BLOCK_CHARACTERS));

    if (cut <= 0) {
      // The first word alone is longer than a block. It cannot be cut
      // without breaking a word in half, so the cut comes after it.
      const after = nextWhitespaceIndex(rest, BLOCK_CHARACTERS);

      if (after === -1) {
        pieces.push(rest);
        rest = "";
        break;
      }

      pieces.push(rest.slice(0, after));
      rest = rest.slice(after).trimStart();
      continue;
    }

    pieces.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }

  if (rest.length > 0) {
    pieces.push(rest);
  }

  return pieces;
}

/**
 * The tail of the previous chunk that the next chunk begins with.
 *
 * The tail is cut at a word boundary, so the chunk begins with a whole word.
 * The room is what is left of the chunk's size: an overlap that does not fit
 * would make the chunk longer than it may be.
 */
function overlapOf(previous: string, room: number): string {
  if (room <= 0) {
    return "";
  }

  const limit = Math.min(OVERLAP_CHARACTERS, room);
  const paragraphs = paragraphsOf(previous);
  const last = paragraphs[paragraphs.length - 1] ?? "";

  if (last.length <= limit) {
    return last;
  }

  const tail = last.slice(last.length - limit);
  const cut = tail.search(WHITESPACE);

  return cut === -1 ? tail : tail.slice(cut + 1).trimStart();
}

/**
 * Splits a text into the chunks the retrieval works with.
 *
 * The chunks are the paragraphs of the text, packed until they are full.
 * Every chunk after the first begins with the tail of the one before it.
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = paragraphsOf(normalized).flatMap(splitParagraph);

  if (blocks.length === 0) {
    return [];
  }

  // The blocks are packed into chunks. Every chunk after the first leaves
  // room for the overlap it begins with.
  const groups: string[][] = [];
  let current: string[] = [];
  let length = 0;
  let budget = TARGET_CHUNK_CHARACTERS;

  for (const block of blocks) {
    const separator = current.length === 0 ? 0 : 2;

    if (current.length > 0 && length + separator + block.length > budget) {
      groups.push(current);
      current = [];
      length = 0;
      budget = BLOCK_CHARACTERS;
    }

    const joiner = current.length === 0 ? 0 : 2;

    current.push(block);
    length += joiner + block.length;
  }

  if (current.length > 0) {
    groups.push(current);
  }

  // Every chunk after the first begins with the tail of the one before it.
  const chunks: string[] = [];

  for (const [index, group] of groups.entries()) {
    const content = group.join("\n\n");

    if (index === 0) {
      chunks.push(content);
      continue;
    }

    const previous = chunks[index - 1] ?? "";
    const overlap = overlapOf(previous, TARGET_CHUNK_CHARACTERS - content.length);

    chunks.push(overlap.length === 0 ? content : `${overlap}\n\n${content}`);
  }

  return chunks;
}

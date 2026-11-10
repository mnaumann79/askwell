import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@askwell/shared";
import { CopyButton } from "../copy-button";
import { InstallView } from "./install-view";

const ALPHA: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alpha",
  publicKey: `pk_${"a".repeat(32)}`,
  messagesUsed: 3,
  periodStart: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
};

const BETA: Project = {
  ...ALPHA,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Beta",
  publicKey: `pk_${"b".repeat(32)}`,
};

const APP_URL = "https://askwell.example";

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

/** The children of an element, with the arrays React keeps in them flattened. */
function childrenOf(element: ReactElement<Record<string, unknown>>): ReactNode[] {
  const children = element.props.children as ReactNode | ReactNode[] | undefined;

  if (children === undefined || children === null) {
    return [];
  }

  return Array.isArray(children) ? children.flat() : [children];
}

/** Every element of a tree, depth first. */
function allElements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) {
    return [];
  }

  const element = node as ReactElement<Record<string, unknown>>;

  return [element, ...childrenOf(element).flatMap(allElements)];
}

/** The markup as text, with the entities React escapes turned back. */
function asText(html: string): string {
  return html
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
}

describe("InstallView", () => {
  it("lists the owner's projects", () => {
    const html = renderToStaticMarkup(
      <InstallView projects={[ALPHA, BETA]} selectedId={ALPHA.id} onSelect={() => {}} />,
    );

    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
  });

  it("shows the script tag with the picked project's public key", () => {
    const html = asText(
      renderToStaticMarkup(
        <InstallView projects={[ALPHA, BETA]} selectedId={BETA.id} onSelect={() => {}} />,
      ),
    );

    expect(html).toContain(`data-key="${BETA.publicKey}"`);
    expect(html).not.toContain(`data-key="${ALPHA.publicKey}"`);
    expect(html).toContain(`${APP_URL}/widget.js`);
  });

  it("gives the copy button the snippet it shows", () => {
    const view = InstallView({
      projects: [ALPHA],
      selectedId: ALPHA.id,
      onSelect: () => {},
    });

    const copyButtons = allElements(view).filter((element) => element.type === CopyButton);

    expect(copyButtons).toHaveLength(1);
    expect(copyButtons[0]?.props.text).toBe(
      `<script src="${APP_URL}/widget.js" data-key="${ALPHA.publicKey}"></script>`,
    );
  });

  it("shows the copy button", () => {
    const html = renderToStaticMarkup(
      <InstallView projects={[ALPHA]} selectedId={ALPHA.id} onSelect={() => {}} />,
    );

    expect(html).toContain("Copy");
  });

  it("asks for the project that was picked", () => {
    const picked: string[] = [];

    const view = InstallView({
      projects: [ALPHA, BETA],
      selectedId: ALPHA.id,
      onSelect: (projectId) => picked.push(projectId),
    });

    const radios = allElements(view).filter((element) => element.type === "input");

    expect(radios).toHaveLength(2);

    const change = radios[1]?.props.onChange as (() => void) | undefined;
    change?.();

    expect(picked).toEqual([BETA.id]);
  });
});

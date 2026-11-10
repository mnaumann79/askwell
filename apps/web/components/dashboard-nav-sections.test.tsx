import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { currentSection, NavSections } from "./dashboard-nav-sections";

/** The opening tag of the link that points at the href. */
function linkTag(html: string, href: string): string {
  return html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0] ?? "";
}

describe("the dashboard nav", () => {
  it("marks the install page as the section the owner is on", () => {
    const html = renderToStaticMarkup(<NavSections pathname="/dashboard/install" />);

    expect(linkTag(html, "/dashboard/install")).toContain('aria-current="page"');
    expect(linkTag(html, "/dashboard")).not.toContain("aria-current");
  });

  it("marks the overview as the section the owner is on", () => {
    const html = renderToStaticMarkup(<NavSections pathname="/dashboard" />);

    expect(linkTag(html, "/dashboard")).toContain('aria-current="page"');
    expect(linkTag(html, "/dashboard/install")).not.toContain("aria-current");
  });

  it("marks only one section", () => {
    const html = renderToStaticMarkup(<NavSections pathname="/dashboard/install" />);

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("marks nothing on a page that is not a section", () => {
    const html = renderToStaticMarkup(<NavSections pathname="/dashboard/nowhere" />);

    expect(html).not.toContain('aria-current="page"');
  });

  it("fills the section the owner is on, so the marker is not only for a screen reader", () => {
    const html = renderToStaticMarkup(<NavSections pathname="/dashboard/install" />);

    expect(linkTag(html, "/dashboard/install")).toContain("bg-border");
    expect(linkTag(html, "/dashboard")).not.toContain("bg-border");
  });

  it("leaves a section without a page of its own as plain text", () => {
    const html = renderToStaticMarkup(<NavSections pathname="/dashboard" />);

    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain("Knowledge</a>");
  });

  it("links the sections that have a page of their own", () => {
    const html = renderToStaticMarkup(<NavSections pathname="/dashboard" />);

    expect(linkTag(html, "/dashboard/projects")).toContain('href="/dashboard/projects"');
    expect(linkTag(html, "/dashboard/install")).toContain('href="/dashboard/install"');
    expect(html).not.toContain('href="/dashboard/knowledge"');
  });

  it("finds the section the pathname is in", () => {
    expect(currentSection("/dashboard/install")?.label).toBe("Install");
    expect(currentSection("/dashboard")?.label).toBe("Overview");
    expect(currentSection("/dashboard/nowhere")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./renderMarkdown";

// Mount into a detached div so assertions can use querySelector.
const mount = (md: string): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = renderMarkdownToHtml(md);
  return el;
};

describe("GFM rendering", () => {
  it("renders headings", () => {
    const el = mount("# Title\n\n## Sub");
    expect(el.querySelector("h1")?.textContent).toBe("Title");
    expect(el.querySelector("h2")?.textContent).toBe("Sub");
  });

  it("renders nested lists", () => {
    const el = mount("- a\n  - b\n- c");
    expect(el.querySelectorAll("ul").length).toBe(2);
    expect(el.querySelectorAll("li").length).toBe(3);
  });

  it("renders task lists as disabled checkboxes", () => {
    const el = mount("- [x] done\n- [ ] todo");
    const boxes = el.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    boxes.forEach((b) => expect(b.hasAttribute("disabled")).toBe(true));
  });

  it("renders fenced code with escaped content and language class", () => {
    const el = mount('```js\nconst a = "<b>";\n```');
    const code = el.querySelector("pre code");
    expect(code?.className).toContain("language-js");
    expect(code?.textContent).toContain('const a = "<b>"');
    expect(el.querySelector("pre b")).toBeNull(); // "<b>" stayed text, not markup
  });

  it("renders blockquote, hr, strikethrough", () => {
    const el = mount("> quoted\n\n---\n\n~~gone~~");
    expect(el.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(el.querySelector("hr")).not.toBeNull();
    expect(el.querySelector("del")?.textContent).toBe("gone");
  });

  it("renders GFM tables", () => {
    const el = mount("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(el.querySelector("table thead th")?.textContent).toBe("a");
    expect(el.querySelector("table tbody td")?.textContent).toBe("1");
  });

  it("autolinks bare URLs", () => {
    const el = mount("see https://example.com/x");
    expect(el.querySelector('a[href="https://example.com/x"]')).not.toBeNull();
  });

  it("rewrites markdown images to plain links — never <img>", () => {
    const el = mount("![diagram](https://example.com/d.png)");
    expect(el.querySelector("img")).toBeNull();
    const a = el.querySelector('a[href="https://example.com/d.png"]');
    expect(a?.textContent).toBe("diagram");
  });

  it("uses the URL as link text when an image has no alt", () => {
    const el = mount("![](https://example.com/d.png)");
    expect(el.querySelector("a")?.textContent).toBe("https://example.com/d.png");
  });

  it("returns empty output for empty input", () => {
    expect(renderMarkdownToHtml("").trim()).toBe("");
  });
});

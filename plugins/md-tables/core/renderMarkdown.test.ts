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
    expect(boxes[0].hasAttribute("checked")).toBe(true);
    expect(boxes[1].hasAttribute("checked")).toBe(false);
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

  it("preserves ordered-list start", () => {
    const el = mount("3. a\n4. b");
    expect(el.querySelector("ol")?.getAttribute("start")).toBe("3");
  });

  it("preserves table column alignment", () => {
    const el = mount("| a |\n| :-: |\n| 1 |");
    const th = el.querySelector("th");
    expect(th?.getAttribute("align")).toBe("center");
  });
});

describe("sanitization", () => {
  it("strips <script>", () => {
    const out = renderMarkdownToHtml("hi\n\n<script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips event handler attributes on raw HTML", () => {
    const out = renderMarkdownToHtml('<a href="https://x.y" onclick="evil()">x</a>');
    expect(out).not.toContain("onclick");
  });

  it("removes raw <img>, including onerror payloads", () => {
    const out = renderMarkdownToHtml('<img src="https://t.example/p.gif" onerror="evil()">');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("onerror");
  });

  it("removes javascript: and data: hrefs", () => {
    const out = renderMarkdownToHtml(
      "[a](javascript:alert(1))\n\n[b](data:text/html,x)",
    );
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:");
  });

  it("removes iframes, style blocks, and svg", () => {
    const out = renderMarkdownToHtml(
      '<iframe src="https://x.y"></iframe>\n\n<style>*{color:red}</style>\n\n<svg onload="evil()"></svg>',
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<svg");
  });

  it("forces target=_blank rel=noopener noreferrer on every link", () => {
    const el = mount('[a](https://x.y) and <a href="https://z.w">b</a>');
    const anchors = el.querySelectorAll("a");
    expect(anchors.length).toBe(2);
    anchors.forEach((a) => {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    });
  });

  it("removes non-checkbox inputs entirely", () => {
    const el = mount('<input type="text" value="x"> <input type="checkbox">');
    const inputs = el.querySelectorAll("input");
    expect(inputs.length).toBe(1);
    expect(inputs[0].getAttribute("type")).toBe("checkbox");
    expect(inputs[0].hasAttribute("disabled")).toBe(true);
  });

  it("neutralizes HTML hidden inside fenced code", () => {
    const el = mount('```\n<script>alert(1)</script>\n```');
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("pre code")?.textContent).toContain("<script>alert(1)</script>");
  });

  it("removes formaction and svg xlink:href vectors", () => {
    const out = renderMarkdownToHtml(
      '<button formaction="javascript:evil()">x</button>\n\n<svg><a xlink:href="javascript:evil()">y</a></svg>',
    );
    expect(out).not.toContain("formaction");
    expect(out).not.toContain("xlink:href");
    expect(out).not.toContain("javascript:");
  });

  it("strips data-* attributes", () => {
    const out = renderMarkdownToHtml('<p data-mdt-inserted="1" data-x="y">hi</p>');
    expect(out).not.toContain("data-mdt-inserted");
    expect(out).not.toContain("data-x");
    expect(out).toContain("hi");
  });
});

import { describe, expect, test } from "vitest";
import { formatInline } from "./formatInline";

function html(cell: string): string {
  const div = document.createElement("div");
  div.append(...formatInline(cell, document));
  return div.innerHTML;
}

describe("formatInline", () => {
  test("passes plain text through", () => {
    expect(html("just text")).toBe("just text");
  });

  test("renders bold", () => {
    expect(html("**Auth**")).toBe("<strong>Auth</strong>");
  });

  test("renders italic", () => {
    expect(html("*wip*")).toBe("<em>wip</em>");
  });

  test("renders inline code", () => {
    expect(html("`done`")).toBe("<code>done</code>");
  });

  test("renders strikethrough", () => {
    expect(html("~~old~~")).toBe("<s>old</s>");
  });

  test("does not format inside code spans", () => {
    expect(html("`**x**`")).toBe("<code>**x**</code>");
  });

  test("escapes HTML-special characters (injection-safe)", () => {
    expect(html('<img src=x onerror=alert(1)>&"')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;&amp;"',
    );
  });

  test("mixes formatted and plain segments", () => {
    expect(html("a **b** c")).toBe("a <strong>b</strong> c");
  });
});

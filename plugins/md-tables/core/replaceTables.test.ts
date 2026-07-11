import { describe, expect, test } from "vitest";
import { renderTablesInContent, restoreReplacedTables } from "./replaceTables";

function span(text: string): HTMLElement {
  const s = document.createElement("span");
  s.append(document.createTextNode(text));
  return s;
}
function strong(text: string): HTMLElement {
  const s = document.createElement("strong");
  s.append(document.createTextNode(text));
  return s;
}

function headerTexts(el: HTMLElement): (string | null)[] {
  return [...el.querySelectorAll(".mdt-table thead th")].map((th) => th.textContent);
}
function bodyRows(el: HTMLElement): (string | null)[][] {
  return [...el.querySelectorAll(".mdt-table tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent),
  );
}

describe("renderTablesInContent", () => {
  test("renders a table split across span/strong siblings and PRESERVES cell formatting", () => {
    // Arrange — exactly the structure a live probe showed: `**bold**` in a cell is a
    // <strong>, splitting the row across span + strong + span.
    const contentEl = document.createElement("div");
    contentEl.append(span("| Col A | Col B |\n|-------|-------|\n| plain | "));
    contentEl.append(strong("bold"));
    contentEl.append(span(" |\n| a | b |"));

    // Act
    const rendered = renderTablesInContent(contentEl);

    // Assert — structure parsed from rendered text
    expect(rendered).toBe(1);
    expect(headerTexts(contentEl)).toEqual(["Col A", "Col B"]);
    expect(bodyRows(contentEl)).toEqual([["plain", "bold"], ["a", "b"]]);

    // The bold cell keeps its <strong> (cloned) — this is the whole point of v0.3.
    const boldCell = contentEl.querySelector(".mdt-table tbody tr:first-child td:nth-child(2)");
    expect(boldCell?.querySelector("strong")?.textContent).toBe("bold");

    // Originals stashed hidden for restore (incl. the <strong>).
    const holder = contentEl.querySelector(".mdt-src") as HTMLElement;
    expect(holder.style.display).toBe("none");
    expect(holder.textContent).toContain("| Col A | Col B |");
    expect(holder.querySelector("strong")).not.toBeNull();
  });

  test("round-trip: restoreReplacedTables restores the span/strong table exactly", () => {
    const contentEl = document.createElement("div");
    contentEl.append(span("| Col A | Col B |\n|-------|-------|\n| plain | "));
    contentEl.append(strong("bold"));
    contentEl.append(span(" |\n| a | b |"));
    const original = contentEl.textContent;

    renderTablesInContent(contentEl);
    expect(contentEl.querySelector(".mdt-table")).not.toBeNull();
    restoreReplacedTables(contentEl);

    expect(contentEl.textContent).toBe(original);
    expect(contentEl.querySelectorAll(".mdt-table")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });

  test("renders a plain single-span table", () => {
    const contentEl = document.createElement("div");
    contentEl.append(span("| a | b |\n|---|---|\n| 1 | 2 |"));

    const rendered = renderTablesInContent(contentEl);

    expect(rendered).toBe(1);
    expect(headerTexts(contentEl)).toEqual(["a", "b"]);
    expect(bodyRows(contentEl)).toEqual([["1", "2"]]);
  });

  test("carves a table out of a paragraph, preserving surrounding text; round-trips", () => {
    const contentEl = document.createElement("div");
    contentEl.append(span("intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\noutro"));
    const original = contentEl.textContent;

    const rendered = renderTablesInContent(contentEl);

    expect(rendered).toBe(1);
    expect(contentEl.querySelector(".mdt-table")).not.toBeNull();
    expect(contentEl.textContent).toContain("intro");
    expect(contentEl.textContent).toContain("outro");

    restoreReplacedTables(contentEl);
    expect(contentEl.textContent).toBe(original);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });

  test("ignores block elements; renders a table that follows a header block", () => {
    const contentEl = document.createElement("div");
    const h3 = document.createElement("h3");
    h3.append(document.createTextNode("Header"));
    contentEl.append(h3);
    contentEl.append(span("| a | b |\n|---|---|\n| 1 | 2 |"));

    const rendered = renderTablesInContent(contentEl);

    expect(rendered).toBe(1);
    expect(contentEl.querySelector("h3")?.textContent).toBe("Header");
    expect(headerTexts(contentEl)).toEqual(["a", "b"]);
  });

  test("does not render pipes that lack a delimiter row; leaves the DOM untouched", () => {
    const contentEl = document.createElement("div");
    contentEl.append(span("a | b | c"));
    const before = contentEl.innerHTML;

    const rendered = renderTablesInContent(contentEl);

    expect(rendered).toBe(0);
    expect(contentEl.querySelectorAll(".mdt-table")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
    expect(contentEl.innerHTML).toBe(before);
  });

  test("renders two tables in one run and restores both exactly", () => {
    const contentEl = document.createElement("div");
    contentEl.append(span("| a |\n|---|\n| 1 |\n\ntext\n\n| b |\n|---|\n| 2 |"));
    const original = contentEl.textContent;

    const rendered = renderTablesInContent(contentEl);

    expect(rendered).toBe(2);
    expect(contentEl.querySelectorAll(".mdt-table")).toHaveLength(2);
    expect(contentEl.textContent).toContain("text");

    restoreReplacedTables(contentEl);
    expect(contentEl.textContent).toBe(original);
    expect(contentEl.querySelectorAll(".mdt-table")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });

  test("applies column alignment from the rendered delimiter row", () => {
    const contentEl = document.createElement("div");
    contentEl.append(span("| a | b | c |\n| :-- | --: | :-: |\n| 1 | 2 | 3 |"));

    renderTablesInContent(contentEl);

    const ths = [...contentEl.querySelectorAll(".mdt-table thead th")] as HTMLElement[];
    expect(ths.map((th) => th.style.textAlign)).toEqual(["left", "right", "center"]);
  });

  test("preserves an inline code element inside a cell", () => {
    const contentEl = document.createElement("div");
    const code = document.createElement("code");
    code.append(document.createTextNode("done"));
    contentEl.append(span("| status |\n|--------|\n| "));
    contentEl.append(code);
    contentEl.append(span(" |"));

    const rendered = renderTablesInContent(contentEl);

    expect(rendered).toBe(1);
    expect(headerTexts(contentEl)).toEqual(["status"]);
    const cell = contentEl.querySelector(".mdt-table tbody td");
    expect(cell?.querySelector("code")?.textContent).toBe("done");
  });
});

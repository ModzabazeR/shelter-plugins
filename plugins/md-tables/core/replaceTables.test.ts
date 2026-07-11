import { describe, expect, test } from "vitest";
import type { TableBlock } from "./parseTables";
import { renderTablesInContent, restoreReplacedTables } from "./replaceTables";

// Stub table builder: encodes the parsed block so tests can assert what detection
// pulled out of the rendered DOM, without depending on the real renderTable styling.
function stubMakeTable(block: TableBlock): HTMLElement {
  const table = document.createElement("table");
  table.className = "stub";
  table.setAttribute("data-head", block.headers.join("|"));
  table.setAttribute("data-body", block.rows.map((r) => r.join("|")).join(";"));
  return table;
}

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

describe("renderTablesInContent", () => {
  test("renders a table split across span/strong siblings (the real Discord shape)", () => {
    // Arrange — exactly the structure a live probe showed: Discord renders `**bold**`
    // inside a cell as a <strong>, splitting the row across span + strong + span, with
    // the "\n"s living inside the spans.
    const contentEl = document.createElement("div");
    contentEl.append(span("| Col A | Col B |\n|-------|-------|\n| plain | "));
    contentEl.append(strong("bold"));
    contentEl.append(span(" |\n| a | b |"));

    // Act
    const rendered = renderTablesInContent(contentEl, stubMakeTable);

    // Assert — detection worked off the rendered text (marker-free), so the block was
    // found and parsed: header + two rows, "bold" as plain text in its cell.
    expect(rendered).toBe(1);
    const table = contentEl.querySelector("table.stub") as HTMLElement;
    expect(table).not.toBeNull();
    expect(table.getAttribute("data-head")).toBe("Col A|Col B");
    expect(table.getAttribute("data-body")).toBe("plain|bold;a|b");

    // The carved-out rendered nodes are stashed hidden (not deleted), incl. the <strong>.
    const holder = contentEl.querySelector(".mdt-src") as HTMLElement;
    expect(holder).not.toBeNull();
    expect(holder.style.display).toBe("none");
    expect(holder.textContent).toContain("| Col A | Col B |");
    expect(holder.querySelector("strong")).not.toBeNull();
  });

  test("round-trip: restoreReplacedTables restores the span/strong table exactly", () => {
    // Arrange
    const contentEl = document.createElement("div");
    contentEl.append(span("| Col A | Col B |\n|-------|-------|\n| plain | "));
    contentEl.append(strong("bold"));
    contentEl.append(span(" |\n| a | b |"));
    const original = contentEl.textContent;

    // Act — render then restore
    renderTablesInContent(contentEl, stubMakeTable);
    expect(contentEl.querySelector("table.stub")).not.toBeNull();
    restoreReplacedTables(contentEl);

    // Assert — text back exactly, no leftover table or hidden holder
    expect(contentEl.textContent).toBe(original);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });

  test("renders a plain single-span table", () => {
    // Arrange
    const contentEl = document.createElement("div");
    contentEl.append(span("| a | b |\n|---|---|\n| 1 | 2 |"));

    // Act
    const rendered = renderTablesInContent(contentEl, stubMakeTable);

    // Assert
    expect(rendered).toBe(1);
    const table = contentEl.querySelector("table.stub") as HTMLElement;
    expect(table.getAttribute("data-head")).toBe("a|b");
    expect(table.getAttribute("data-body")).toBe("1|2");
  });

  test("carves a table out of a paragraph, preserving surrounding text; round-trips", () => {
    // Arrange — table embedded mid-span with text before and after (one Text node).
    const contentEl = document.createElement("div");
    contentEl.append(span("intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\noutro"));
    const original = contentEl.textContent;

    // Act
    const rendered = renderTablesInContent(contentEl, stubMakeTable);

    // Assert — only the table was carved out; surrounding prose survives.
    expect(rendered).toBe(1);
    expect(contentEl.querySelector("table.stub")).not.toBeNull();
    expect(contentEl.textContent).toContain("intro");
    expect(contentEl.textContent).toContain("outro");
    const holder = contentEl.querySelector(".mdt-src") as HTMLElement;
    expect(holder.textContent).toContain("| a | b |");

    // Restore is exact.
    restoreReplacedTables(contentEl);
    expect(contentEl.textContent).toBe(original);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });

  test("ignores block elements; renders a table that follows a header block", () => {
    // Arrange — an <h3> (block) before the table must not be glued to the table's
    // first line, and must be left untouched.
    const contentEl = document.createElement("div");
    const h3 = document.createElement("h3");
    h3.append(document.createTextNode("Header"));
    contentEl.append(h3);
    contentEl.append(span("| a | b |\n|---|---|\n| 1 | 2 |"));

    // Act
    const rendered = renderTablesInContent(contentEl, stubMakeTable);

    // Assert
    expect(rendered).toBe(1);
    expect(contentEl.querySelector("h3")?.textContent).toBe("Header");
    const table = contentEl.querySelector("table.stub") as HTMLElement;
    expect(table.getAttribute("data-head")).toBe("a|b");
  });

  test("does not render pipes that lack a delimiter row; leaves the DOM untouched", () => {
    // Arrange
    const contentEl = document.createElement("div");
    contentEl.append(span("a | b | c"));
    const before = contentEl.innerHTML;

    // Act
    const rendered = renderTablesInContent(contentEl, stubMakeTable);

    // Assert
    expect(rendered).toBe(0);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
    expect(contentEl.innerHTML).toBe(before);
  });

  test("renders two tables in one run and restores both exactly", () => {
    // Arrange
    const contentEl = document.createElement("div");
    contentEl.append(span("| a |\n|---|\n| 1 |\n\ntext\n\n| b |\n|---|\n| 2 |"));
    const original = contentEl.textContent;

    // Act
    const rendered = renderTablesInContent(contentEl, stubMakeTable);

    // Assert
    expect(rendered).toBe(2);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(2);
    expect(contentEl.textContent).toContain("text");

    restoreReplacedTables(contentEl);
    expect(contentEl.textContent).toBe(original);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });

  test("parses column alignment from the rendered delimiter row", () => {
    // Arrange
    const contentEl = document.createElement("div");
    contentEl.append(span("| a | b | c |\n| :-- | --: | :-: |\n| 1 | 2 | 3 |"));

    // Act
    let captured: TableBlock | null = null;
    renderTablesInContent(contentEl, (b) => {
      captured = b;
      return stubMakeTable(b);
    });

    // Assert
    expect(captured).not.toBeNull();
    expect(captured!.aligns).toEqual(["left", "right", "center"]);
  });
});

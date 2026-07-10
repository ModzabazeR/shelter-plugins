import { describe, expect, test } from "vitest";
import { parseTables, type TableBlock } from "./parseTables";
import { replaceTablesInContent, restoreReplacedTables } from "./replaceTables";

function stubMakeTable(_block: TableBlock): HTMLElement {
  const table = document.createElement("table");
  table.className = "stub";
  return table;
}

function appendBrSeparatedLines(el: HTMLElement, lines: string[]): void {
  lines.forEach((line, idx) => {
    if (idx > 0) el.append(document.createElement("br"));
    el.append(document.createTextNode(line));
  });
}

describe("replaceTablesInContent", () => {
  test("replaces a table whose lines are separated by <br> elements", () => {
    // Arrange
    const lines = ["intro", "| a | b |", "| - | - |", "| 1 | 2 |", "end"];
    const content = lines.join("\n");
    const contentEl = document.createElement("div");
    appendBrSeparatedLines(contentEl, lines);
    const blocks = parseTables(content);

    // Act
    replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert — table rendered, surrounding text preserved, table lines hidden (not
    // visible as raw text, even though the hidden `.mdt-src` node still exists).
    const tables = contentEl.querySelectorAll("table.stub");
    expect(tables).toHaveLength(1);
    expect(contentEl.textContent).toContain("intro");
    expect(contentEl.textContent).toContain("end");
    const srcSpan = contentEl.querySelector(".mdt-src") as HTMLElement | null;
    expect(srcSpan).not.toBeNull();
    expect(srcSpan!.textContent).toContain("| a | b |");
    expect(srcSpan!.style.display).toBe("none");
  });

  test("replaces a table held in a single \\n-delimited text node without deleting surrounding text", () => {
    // Arrange — this is the shared-text-node bug case: the whole message is ONE
    // Text node, so naive removal of that node would also delete "intro"/"end".
    const content = "intro\n| a | b |\n| - | - |\n| 1 | 2 |\nend";
    const contentEl = document.createElement("div");
    contentEl.append(document.createTextNode(content));
    const blocks = parseTables(content);

    // Act
    replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert
    const tables = contentEl.querySelectorAll("table.stub");
    expect(tables).toHaveLength(1);
    expect(contentEl.textContent).toContain("intro");
    expect(contentEl.textContent).toContain("end");
    const srcSpan = contentEl.querySelector(".mdt-src") as HTMLElement | null;
    expect(srcSpan).not.toBeNull();
    expect(srcSpan!.textContent).toContain("| a | b |");
    expect(srcSpan!.style.display).toBe("none");
  });

  test("replaces two tables in one contentEl, preserving the text between them", () => {
    // Arrange
    const lines = [
      "before",
      "| a |",
      "| - |",
      "| 1 |",
      "middle",
      "| b |",
      "| - |",
      "| 2 |",
      "after",
    ];
    const content = lines.join("\n");
    const contentEl = document.createElement("div");
    appendBrSeparatedLines(contentEl, lines);
    const blocks = parseTables(content);
    expect(blocks).toHaveLength(2);

    // Act
    replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert
    const tables = contentEl.querySelectorAll("table.stub");
    expect(tables).toHaveLength(2);
    expect(contentEl.textContent).toContain("before");
    expect(contentEl.textContent).toContain("middle");
    expect(contentEl.textContent).toContain("after");
    const srcSpans = contentEl.querySelectorAll(".mdt-src");
    expect(srcSpans).toHaveLength(2);
    srcSpans.forEach((span) => {
      expect((span as HTMLElement).style.display).toBe("none");
    });
  });

  test("no-ops when the block's lines cannot be located in contentEl", () => {
    // Arrange — blocks parsed from a DIFFERENT message than what's actually in the DOM.
    const domContent = "just some unrelated text, no tables here";
    const contentEl = document.createElement("div");
    contentEl.append(document.createTextNode(domContent));
    const originalHtml = contentEl.innerHTML;

    const otherContent = "| a | b |\n| - | - |\n| 1 | 2 |";
    const blocksForOtherContent = parseTables(otherContent);
    expect(blocksForOtherContent).toHaveLength(1);

    // Act — note `content` is `otherContent` (what the blocks were parsed from), but
    // `contentEl`'s actual DOM text is `domContent`, so the table's lines can't be
    // found inside it.
    replaceTablesInContent(contentEl, otherContent, blocksForOtherContent, stubMakeTable);

    // Assert — no table inserted, no hidden source span, DOM unchanged.
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
    expect(contentEl.innerHTML).toBe(originalHtml);
  });

  test("hides table source lines behind .mdt-src instead of deleting them", () => {
    // Arrange
    const lines = ["intro", "| a | b |", "| - | - |", "| 1 | 2 |", "end"];
    const content = lines.join("\n");
    const contentEl = document.createElement("div");
    appendBrSeparatedLines(contentEl, lines);
    const blocks = parseTables(content);

    // Act
    replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert — the raw pipe text still exists in the DOM (not deleted), just hidden.
    const srcSpan = contentEl.querySelector(".mdt-src") as HTMLElement | null;
    expect(srcSpan).not.toBeNull();
    expect(srcSpan!.textContent).toContain("| a | b |");
    expect(srcSpan!.textContent).toContain("| - | - |");
    expect(srcSpan!.textContent).toContain("| 1 | 2 |");
    expect(srcSpan!.style.display).toBe("none");
    // Surrounding text remains visible (outside the hidden span).
    expect(contentEl.textContent).toContain("intro");
    expect(contentEl.textContent).toContain("end");
  });

  test("round-trip: restoreReplacedTables restores <br>-separated content exactly", () => {
    // Arrange
    const lines = ["intro", "| a | b |", "| - | - |", "| 1 | 2 |", "end"];
    const content = lines.join("\n");
    const contentEl = document.createElement("div");
    appendBrSeparatedLines(contentEl, lines);
    const originalTextContent = contentEl.textContent;
    const blocks = parseTables(content);

    // Act — replace
    replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert — replaced state: table present, source hidden
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(1);
    const srcSpan = contentEl.querySelector(".mdt-src") as HTMLElement | null;
    expect(srcSpan).not.toBeNull();
    expect(srcSpan!.style.display).toBe("none");

    // Act — restore
    restoreReplacedTables(contentEl);

    // Assert — restored state: identical text, no leftover table or hidden span
    expect(contentEl.textContent).toBe(originalTextContent);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });

  test("round-trip: restoreReplacedTables restores a single \\n text node exactly", () => {
    // Arrange
    const content = "intro\n| a | b |\n| - | - |\n| 1 | 2 |\nend";
    const contentEl = document.createElement("div");
    contentEl.append(document.createTextNode(content));
    const originalTextContent = contentEl.textContent;
    const blocks = parseTables(content);

    // Act — replace
    replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert — replaced state
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(1);
    expect(contentEl.querySelector(".mdt-src")).not.toBeNull();

    // Act — restore
    restoreReplacedTables(contentEl);

    // Assert — restored state
    expect(contentEl.textContent).toBe(originalTextContent);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });

  test("round-trip: two tables are both replaced and both restored exactly", () => {
    // Arrange
    const lines = [
      "before",
      "| a |",
      "| - |",
      "| 1 |",
      "middle",
      "| b |",
      "| - |",
      "| 2 |",
      "after",
    ];
    const content = lines.join("\n");
    const contentEl = document.createElement("div");
    appendBrSeparatedLines(contentEl, lines);
    const originalTextContent = contentEl.textContent;
    const blocks = parseTables(content);
    expect(blocks).toHaveLength(2);

    // Act — replace
    replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert — replaced state
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(2);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(2);

    // Act — restore
    restoreReplacedTables(contentEl);

    // Assert — restored state
    expect(contentEl.textContent).toBe(originalTextContent);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
  });
});

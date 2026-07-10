import { describe, expect, test } from "vitest";
import { parseTables, type TableBlock } from "./parseTables";
import { replaceTablesInContent } from "./replaceTables";

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

    // Assert
    const tables = contentEl.querySelectorAll("table.stub");
    expect(tables).toHaveLength(1);
    expect(contentEl.textContent).toContain("intro");
    expect(contentEl.textContent).toContain("end");
    expect(contentEl.textContent).not.toContain("| a | b |");
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
    expect(contentEl.textContent).not.toContain("| a | b |");
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
    expect(contentEl.textContent).not.toContain("| a |");
    expect(contentEl.textContent).not.toContain("| b |");
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

    // Assert
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.innerHTML).toBe(originalHtml);
  });
});

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
    const replaced = replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert — table rendered, surrounding text preserved, table lines hidden (not
    // visible as raw text, even though the hidden `.mdt-src` node still exists).
    expect(replaced).toBe(1);
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
    const replaced = replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert
    expect(replaced).toBe(1);
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
    const replaced = replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert
    expect(replaced).toBe(2);
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
    const replaced = replaceTablesInContent(
      contentEl,
      otherContent,
      blocksForOtherContent,
      stubMakeTable,
    );

    // Assert — no table inserted, no hidden source span, DOM unchanged.
    expect(replaced).toBe(0);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
    expect(contentEl.innerHTML).toBe(originalHtml);
  });

  test("returns 0 and leaves the DOM byte-for-byte untouched when a mention/emoji makes a table line unmatchable (guard-on-failure case)", () => {
    // Arrange — simulates the real trigger: Discord renders `<@123>` in raw
    // `message.content` as the text "@Bob" in the DOM, so the trimmed-text
    // comparison in matchRange never matches that line. The whole message is a
    // SINGLE Text node containing embedded "\n"s (mirroring how Discord often
    // doesn't split lines into <br> elements), which is exactly the shape that
    // forces `normalizeNewlines` to split the text node as a side effect —
    // this test guards against that split leaking out of a zero-match call.
    const content = "| <@123> | b |\n| - | - |\n| 1 | 2 |";
    const domText = "| @Bob | b |\n| - | - |\n| 1 | 2 |";
    const contentEl = document.createElement("div");
    contentEl.append(document.createTextNode(domText));
    const blocks = parseTables(content);
    expect(blocks).toHaveLength(1);

    const textContentBefore = contentEl.textContent;
    const childNodesLengthBefore = contentEl.childNodes.length;

    // Act
    const replaced = replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert — no table, no hidden source span, text unchanged, and the DOM was not
    // split into multiple nodes by normalizeNewlines's side effect.
    expect(replaced).toBe(0);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
    expect(contentEl.textContent).toBe(textContentBefore);
    expect(contentEl.childNodes.length).toBe(childNodesLengthBefore);
  });

  test("a zero-match call is safely repeatable: calling twice still returns 0 and leaves the DOM unchanged", () => {
    // Arrange — same mention-mismatch shape as above.
    const content = "| <@123> | b |\n| - | - |\n| 1 | 2 |";
    const domText = "| @Bob | b |\n| - | - |\n| 1 | 2 |";
    const contentEl = document.createElement("div");
    contentEl.append(document.createTextNode(domText));
    const blocks = parseTables(content);

    const textContentBefore = contentEl.textContent;
    const childNodesLengthBefore = contentEl.childNodes.length;

    // Act — call twice, mirroring processRow being invoked again on the next dispatch
    // because the guard was never set.
    const firstReplaced = replaceTablesInContent(contentEl, content, blocks, stubMakeTable);
    const secondReplaced = replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert
    expect(firstReplaced).toBe(0);
    expect(secondReplaced).toBe(0);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(0);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(0);
    expect(contentEl.textContent).toBe(textContentBefore);
    expect(contentEl.childNodes.length).toBe(childNodesLengthBefore);
  });

  test("partial match: only the locatable block is replaced, returns 1, and the unmatched block's raw text stays visible", () => {
    // Arrange — two blocks; the second's DOM text diverges from its raw content the
    // same way a mention/emoji would (raw "| <@123> |" rendered as DOM "| @Bob |").
    const rawLines = [
      "before",
      "| a |",
      "| - |",
      "| 1 |",
      "middle",
      "| <@123> |",
      "| - |",
      "| 2 |",
      "after",
    ];
    const domLines = [
      "before",
      "| a |",
      "| - |",
      "| 1 |",
      "middle",
      "| @Bob |",
      "| - |",
      "| 2 |",
      "after",
    ];
    const content = rawLines.join("\n");
    const contentEl = document.createElement("div");
    appendBrSeparatedLines(contentEl, domLines);
    const blocks = parseTables(content);
    expect(blocks).toHaveLength(2);

    // Act
    const replaced = replaceTablesInContent(contentEl, content, blocks, stubMakeTable);

    // Assert — only the first (locatable) block was replaced.
    expect(replaced).toBe(1);
    expect(contentEl.querySelectorAll("table.stub")).toHaveLength(1);
    expect(contentEl.querySelectorAll(".mdt-src")).toHaveLength(1);
    // The unmatched block's raw text is still visible (not wrapped/hidden).
    expect(contentEl.textContent).toContain("@Bob");
    expect(contentEl.textContent).toContain("before");
    expect(contentEl.textContent).toContain("middle");
    expect(contentEl.textContent).toContain("after");
    const srcSpan = contentEl.querySelector(".mdt-src") as HTMLElement;
    expect(srcSpan.textContent).toContain("| a |");
    expect(srcSpan.textContent).not.toContain("@Bob");
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

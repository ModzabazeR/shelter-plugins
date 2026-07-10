import { describe, expect, test } from "vitest";
import { parseTables } from "./parseTables";

describe("parseTables", () => {
  test("parses a basic table with outer pipes", () => {
    const text = "| Name | Role |\n| ---- | ---- |\n| Ana | Lead |\n| Ben | Eng |";
    const [t] = parseTables(text);
    expect(t.headers).toEqual(["Name", "Role"]);
    expect(t.aligns).toEqual([null, null]);
    expect(t.rows).toEqual([["Ana", "Lead"], ["Ben", "Eng"]]);
    expect(t.startLine).toBe(0);
    expect(t.endLine).toBe(3);
  });

  test("parses a table without outer pipes", () => {
    const text = "a | b\n- | -\nc | d";
    const [t] = parseTables(text);
    expect(t.headers).toEqual(["a", "b"]);
    expect(t.rows).toEqual([["c", "d"]]);
  });

  test("reads alignment markers", () => {
    const text = "| a | b | c | d |\n| :-- | --: | :-: | --- |";
    const [t] = parseTables(text);
    expect(t.aligns).toEqual(["left", "right", "center", null]);
  });

  test("keeps escaped pipes inside a cell", () => {
    const text = "| a | b |\n| - | - |\n| x \\| y | z |";
    const [t] = parseTables(text);
    expect(t.rows).toEqual([["x | y", "z"]]);
  });

  test("pads and truncates ragged body rows to the column count", () => {
    const text = "| a | b |\n| - | - |\n| one |\n| p | q | r |";
    const [t] = parseTables(text);
    expect(t.rows).toEqual([["one", ""], ["p", "q"]]);
  });

  test("rejects pipes with no delimiter row", () => {
    expect(parseTables("| a | b |\n| c | d |")).toEqual([]);
  });

  test("rejects a header/delimiter column-count mismatch", () => {
    expect(parseTables("a | b\n---\nc | d")).toEqual([]);
  });

  test("computes line ranges when preceded by text", () => {
    const text = "intro\n\n| a | b |\n| - | - |\n| c | d |";
    const [t] = parseTables(text);
    expect(t.startLine).toBe(2);
    expect(t.endLine).toBe(4);
  });

  test("finds multiple tables in one message", () => {
    const text = "| a |\n| - |\n| 1 |\n\ntext\n\n| b |\n| - |\n| 2 |";
    const tables = parseTables(text);
    expect(tables).toHaveLength(2);
    expect(tables[1].rows).toEqual([["2"]]);
  });
});

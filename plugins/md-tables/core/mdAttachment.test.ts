import { describe, expect, it } from "vitest";
import { isMdAttachment } from "./mdAttachment";

describe("isMdAttachment", () => {
  it("accepts .md and .markdown, case-insensitive", () => {
    expect(isMdAttachment({ filename: "README.md" })).toBe(true);
    expect(isMdAttachment({ filename: "NOTES.MD" })).toBe(true);
    expect(isMdAttachment({ filename: "doc.markdown" })).toBe(true);
    expect(isMdAttachment({ filename: "weird.name.v2.md" })).toBe(true);
  });

  it("rejects other extensions and missing filenames", () => {
    expect(isMdAttachment({ filename: "page.mdx" })).toBe(false);
    expect(isMdAttachment({ filename: "notes.txt" })).toBe(false);
    expect(isMdAttachment({ filename: "md" })).toBe(false);
    expect(isMdAttachment({ filename: "archive.md.zip" })).toBe(false);
    expect(isMdAttachment({})).toBe(false);
    expect(isMdAttachment(null)).toBe(false);
    expect(isMdAttachment(undefined)).toBe(false);
  });
});

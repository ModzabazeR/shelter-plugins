import { describe, expect, test } from "vitest";
import { hasId, parseIds, toggleId } from "./allowlist";

describe("parseIds", () => {
    test("splits on commas and whitespace, trims, drops empties", () => {
        expect(parseIds("111, 222   333,,444")).toEqual(["111", "222", "333", "444"]);
    });
    test("empty / nullish -> []", () => {
        expect(parseIds("")).toEqual([]);
        expect(parseIds(undefined)).toEqual([]);
        expect(parseIds(null)).toEqual([]);
    });
});

describe("hasId", () => {
    test("membership", () => {
        expect(hasId("111,222", "222")).toBe(true);
        expect(hasId("111,222", "333")).toBe(false);
    });
    test("false for empty id", () => {
        expect(hasId("111", "")).toBe(false);
        expect(hasId("111", undefined)).toBe(false);
    });
});

describe("toggleId — immutable add/remove", () => {
    test("adds when absent", () => {
        expect(toggleId("111", "222")).toBe("111,222");
        expect(toggleId("", "111")).toBe("111");
    });
    test("removes when present", () => {
        expect(toggleId("111,222,333", "222")).toBe("111,333");
        expect(toggleId("111", "111")).toBe("");
    });
    test("does not mutate the input string's parsed identity (round trip stable)", () => {
        const start = "111,222";
        const added = toggleId(start, "333");
        expect(added).toBe("111,222,333");
        expect(toggleId(added, "333")).toBe("111,222"); // toggling back restores
    });
    test("empty id is a no-op", () => {
        expect(toggleId("111,222", "")).toBe("111,222");
    });
});

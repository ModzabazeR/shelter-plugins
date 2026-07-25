import { describe, expect, test } from "vitest";
import { hasExternalRefs, hasUntrustedRefs, isHtmlAttachment } from "./detect";

const TRUSTED = ["https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://fonts.gstatic.com"];

const att = (o: Partial<{ filename: string; content_type: string; }>) =>
    ({ filename: "", content_type: undefined, ...o }) as any;

describe("isHtmlAttachment", () => {
    test("true for text/html content type", () => {
        expect(isHtmlAttachment(att({ filename: "report", content_type: "text/html" }))).toBe(true);
    });
    test("true for .html / .htm filename regardless of content type", () => {
        expect(isHtmlAttachment(att({ filename: "dashboard.html" }))).toBe(true);
        expect(isHtmlAttachment(att({ filename: "a.HTM" }))).toBe(true);
    });
    test("false for non-html", () => {
        expect(isHtmlAttachment(att({ filename: "notes.txt", content_type: "text/plain" }))).toBe(false);
        expect(isHtmlAttachment(att({ filename: "pic.png", content_type: "image/png" }))).toBe(false);
    });
    test("does not misfire on names that merely contain 'html'", () => {
        expect(isHtmlAttachment(att({ filename: "html-guide.pdf" }))).toBe(false);
    });
    test("safe on missing fields", () => {
        expect(isHtmlAttachment(att({}))).toBe(false);
        expect(isHtmlAttachment(null as any)).toBe(false);
    });
});

describe("hasExternalRefs — drives the 'open in browser for full view' hint", () => {
    test("flags external script/link/img/css @import", () => {
        expect(hasExternalRefs(`<script src="https://cdn.tld/chart.js"></script>`)).toBe(true);
        expect(hasExternalRefs(`<link rel="stylesheet" href="https://cdn.tld/t.css">`)).toBe(true);
        expect(hasExternalRefs(`<img src="//cdn.tld/x.png">`)).toBe(true);
        expect(hasExternalRefs(`<style>@import url(https://f.tld/a.css)</style>`)).toBe(true);
    });
    test("does NOT flag fully self-contained artifacts", () => {
        const selfContained = `<html><head><style>body{color:red}</style></head><body><img src="data:image/png;base64,AAAA"><script>const x=1</script></body></html>`;
        expect(hasExternalRefs(selfContained)).toBe(false);
    });
    test("does not flag anchor links (those are fine, not sub-resources)", () => {
        expect(hasExternalRefs(`<a href="https://example.com">link</a>`)).toBe(false);
    });
});

describe("hasUntrustedRefs — only flags refs the inline tier will actually block", () => {
    test("false when every remote ref is on a trusted CDN (renders inline)", () => {
        const html = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.min.css">
            <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">`;
        expect(hasUntrustedRefs(html, TRUSTED)).toBe(false);
    });

    test("true when any ref is off the allowlist", () => {
        expect(hasUntrustedRefs(`<script src="https://evil.tld/x.js"></script>`, TRUSTED)).toBe(true);
        expect(hasUntrustedRefs(`<img src="//attacker.example/p.png">`, TRUSTED)).toBe(true);
    });

    test("http (non-https) to a trusted host is still untrusted", () => {
        expect(hasUntrustedRefs(`<script src="http://cdn.jsdelivr.net/x.js"></script>`, TRUSTED)).toBe(true);
    });

    test("protocol-relative to a trusted host is trusted", () => {
        expect(hasUntrustedRefs(`<script src="//cdn.jsdelivr.net/x.js"></script>`, TRUSTED)).toBe(false);
    });

    test("false for fully self-contained (no remote refs)", () => {
        expect(hasUntrustedRefs(`<img src="data:image/png;base64,AAAA"><script>const x=1</script>`, TRUSTED)).toBe(false);
    });
});

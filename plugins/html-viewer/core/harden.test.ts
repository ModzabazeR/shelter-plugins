import { describe, expect, test } from "vitest";
import { FULLVIEW_CSP, hardenHtml, LOCKED_CSP, TRUSTED_CDNS } from "./harden";

// The single invariant that carries the whole security model under Legcord's
// csp:"none" (no inherited parent CSP): the injected <meta> CSP must be the
// FIRST thing the parser sees inside <head>, before any resource-loading tag.

const cspIndex = (html: string) => html.indexOf("Content-Security-Policy");
const firstOf = (html: string, re: RegExp) => {
    const m = re.exec(html);
    return m ? m.index : -1;
};

describe("hardenHtml — CSP precedes every resource tag (LOCKED default)", () => {
    test("full document: meta lands right after <head>, before an in-head script", () => {
        const raw = `<!doctype html><html><head><script>fetch("https://evil.tld")</script></head><body>hi</body></html>`;
        const out = hardenHtml(raw);
        expect(cspIndex(out)).toBeGreaterThan(-1);
        expect(cspIndex(out)).toBeLessThan(firstOf(out, /<script/i));
    });

    test("head with attributes is handled", () => {
        const raw = `<html><head lang="en" data-x="1"><img src="https://evil.tld/x.png"></head><body></body></html>`;
        const out = hardenHtml(raw);
        expect(cspIndex(out)).toBeLessThan(firstOf(out, /<img/i));
    });

    test("no <head> but <html> present: CSP still precedes body resources", () => {
        const raw = `<html><body><img src="https://evil.tld/x.png"></body></html>`;
        const out = hardenHtml(raw);
        expect(cspIndex(out)).toBeGreaterThan(-1);
        expect(cspIndex(out)).toBeLessThan(firstOf(out, /<img/i));
    });

    test("bare fragment (no html/head/body) gets wrapped, CSP before content", () => {
        const raw = `<h1>report</h1><script>fetch("https://evil.tld")</script>`;
        const out = hardenHtml(raw);
        expect(cspIndex(out)).toBeGreaterThan(-1);
        expect(cspIndex(out)).toBeLessThan(firstOf(out, /<script/i));
        expect(cspIndex(out)).toBeLessThan(firstOf(out, /<h1/i));
    });

    test("uppercase HEAD tag is matched (case-insensitive)", () => {
        const raw = `<HTML><HEAD><SCRIPT>1</SCRIPT></HEAD><BODY></BODY></HTML>`;
        const out = hardenHtml(raw);
        expect(cspIndex(out)).toBeLessThan(firstOf(out, /<script/i));
    });

    test("an artifact's own permissive CSP meta cannot precede ours", () => {
        const raw = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"><img src="https://evil.tld"></head></html>`;
        const out = hardenHtml(raw);
        expect(out.indexOf("connect-src 'none'")).toBeLessThan(firstOf(out, /<img/i));
        expect(out.indexOf("connect-src 'none'")).toBeGreaterThan(-1);
    });
});

describe("hardenHtml — injects the CSP it is given (FULLVIEW)", () => {
    test("FULLVIEW_CSP is injected before resource tags when passed", () => {
        const raw = `<html><head><script src="https://cdn.jsdelivr.net/x.js"></script></head></html>`;
        const out = hardenHtml(raw, FULLVIEW_CSP);
        expect(cspIndex(out)).toBeLessThan(firstOf(out, /<script/i));
        expect(out).toContain("script-src 'unsafe-inline' 'unsafe-eval' https:");
    });
});

describe("LOCKED_CSP — inline glance: trusted CDNs render, fetch blocked", () => {
    test("blocks fetch-class egress (connect-src 'none')", () => {
        expect(LOCKED_CSP).toMatch(/connect-src 'none'/);
    });

    test("allows the trusted CDNs but NOT arbitrary https", () => {
        // every trusted CDN appears
        for (const cdn of TRUSTED_CDNS) expect(LOCKED_CSP).toContain(cdn);
        // ...but no directive carries a bare `https:` scheme-source (that would
        // be "any https host" and defeat the allowlist)
        expect(LOCKED_CSP).not.toMatch(/(^|\s)https:(\s|$)/);
    });

    test("trusted CDNs reach script, style, and font directives", () => {
        const dir = (name: string) => new RegExp(`${name}-src ([^;]*)`).exec(LOCKED_CSP)?.[1] ?? "";
        expect(dir("script")).toContain("https://cdn.jsdelivr.net");
        expect(dir("style")).toContain("https://fonts.googleapis.com");
        expect(dir("font")).toContain("https://fonts.gstatic.com");
    });

    test("still renders self-contained artifacts: inline script + style allowed", () => {
        expect(LOCKED_CSP).toMatch(/script-src[^;]*'unsafe-inline'/);
        expect(LOCKED_CSP).toMatch(/style-src[^;]*'unsafe-inline'/);
    });

    test("img-src keeps data: and Discord media, still no bare https", () => {
        const imgDirective = /img-src ([^;]*)/.exec(LOCKED_CSP)?.[1] ?? "";
        expect(imgDirective).toMatch(/data:/);
        expect(imgDirective).toContain("https://cdn.discordapp.com");
        expect(imgDirective).not.toMatch(/(^|\s)https:(\s|$)/);
    });

    test("locks base-uri and form-action", () => {
        expect(LOCKED_CSP).toMatch(/base-uri 'none'/);
        expect(LOCKED_CSP).toMatch(/form-action 'none'/);
    });
});

describe("FULLVIEW_CSP — renders CDN assets, blocks fetch-class egress", () => {
    test("allows https for the four render sub-resource directives", () => {
        expect(FULLVIEW_CSP).toMatch(/script-src[^;]*https:/);
        expect(FULLVIEW_CSP).toMatch(/style-src[^;]*https:/);
        expect(FULLVIEW_CSP).toMatch(/img-src[^;]*https:/);
        expect(FULLVIEW_CSP).toMatch(/font-src[^;]*https:/);
    });

    test("still kills fetch/XHR/WebSocket/sendBeacon via connect-src 'none'", () => {
        expect(FULLVIEW_CSP).toMatch(/connect-src 'none'/);
    });

    test("keeps base-uri and form-action locked", () => {
        expect(FULLVIEW_CSP).toMatch(/base-uri 'none'/);
        expect(FULLVIEW_CSP).toMatch(/form-action 'none'/);
    });
});

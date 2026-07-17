/*
 * Markdown document rendering for .md attachments.
 * marked (GFM) -> DOMPurify with a strict profile. Pure string -> string.
 * Markdown images are rewritten to plain links BEFORE sanitization and `img` is
 * not in the allowlist, so rendering a document performs zero network requests.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import DOMPurify from "dompurify";
import { Marked } from "marked";

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// marked >= 13: renderer methods receive a single token object.
const parser = new Marked({
  gfm: true,
  renderer: {
    image({ href, text }) {
      const url = href ?? "";
      return `<a href="${escapeHtml(url)}">${escapeHtml(text || url)}</a>`;
    },
  },
});

// Own DOMPurify instance so our hooks never interact with any other consumer.
const purifier = DOMPurify(window);

purifier.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  if (node.tagName === "INPUT") {
    // GFM task-list checkboxes are the only inputs allowed to survive, always inert.
    if (node.getAttribute("type") !== "checkbox") {
      node.remove();
      return;
    }
    node.setAttribute("disabled", "");
  }
});

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr", "ul", "ol", "li", "blockquote",
    "pre", "code", "em", "strong", "del", "s", "a",
    "table", "thead", "tbody", "tr", "th", "td",
    "input", "span",
  ],
  ALLOWED_ATTR: ["href", "align", "start", "type", "checked", "disabled", "class"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  // Non-URI attributes must be exempted from ALLOWED_URI_REGEXP, which DOMPurify
  // otherwise applies to every attribute value (stripping type="checkbox" etc.).
  ADD_URI_SAFE_ATTR: ["type", "checked", "disabled", "align", "start"],
  // marked emits no data-* attributes; closing this surface keeps sanitized content
  // from carrying plugin-marker lookalikes.
  ALLOW_DATA_ATTR: false,
};

export function renderMarkdownToHtml(text: string): string {
  const raw = parser.parse(text, { async: false }) as string;
  return purifier.sanitize(raw, PURIFY_CONFIG);
}

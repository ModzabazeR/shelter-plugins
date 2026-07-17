/*
 * Attachment detection for .md files. Filename-only, case-insensitive — Discord
 * reports text/plain (or nothing) for markdown uploads, so content_type is not trusted.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const MD_EXT = /\.(md|markdown)$/i;

export function isMdAttachment(
  att: { filename?: string } | null | undefined,
): boolean {
  const name = att?.filename;
  return typeof name === "string" && MD_EXT.test(name);
}

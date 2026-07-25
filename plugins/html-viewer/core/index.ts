/*
 * html-viewer core — framework-agnostic logic: CSP hardening, attachment
 * detection, auto-render allowlists. Pure and unit-tested; the Shelter
 * integration in ../index.tsx is the only untested seam.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export * from "./harden";
export * from "./detect";
export * from "./allowlist";

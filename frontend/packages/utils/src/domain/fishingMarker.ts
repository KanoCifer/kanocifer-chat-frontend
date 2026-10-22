// frontend/packages/utils/src/domain/fishingMarker.ts

import { fishingSpotKindLabel } from "@readinglist/types";
import type { FishingSpotKindFull, MapMarker } from "@readinglist/types";

/**
 * kind → fill colour CSS variable. Used by fish marker divIcon HTML.
 *
 * Partial —— 只覆盖筛选用的三值。后端的 kind 是八值，pond / sea 这些
 * 没有专属色位，查表落空时回退默认色（见 fillFor）。
 */
const KIND_FILL: Partial<Record<FishingSpotKindFull, { bg: string }>> = {
  lake: { bg: "var(--color-accent)" },
  river: { bg: "var(--color-secondary)" },
  reservoir: { bg: "var(--color-page)" },
};

const DEFAULT_FILL = { bg: "var(--color-accent)" };

/**
 * Resolve marker fill colour for a spot kind.
 *
 * 查表落空时回退默认色：后端的 kind 枚举是八值（pond / sea / bay …），
 * 而这张表只声明了筛选用的三值 —— 后端发来 pond 时直接查会得到 undefined，
 * 拼进 marker 的 background 就成了 "background: undefined"，整个标记不显示。
 */
export function fillFor(kind: FishingSpotKindFull | null): { bg: string } {
  return (kind ? KIND_FILL[kind] : undefined) ?? DEFAULT_FILL;
}

/** Simple HTML escaping to prevent XSS in marker content strings. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Fish-shaped divIcon HTML for AMap marker (Vue Lucide fish path version).
 * 38x38 div, rotate(-45deg) so the fish head points toward the coordinate.
 */
export function makeFishMarkerHtml(spot: MapMarker, index: number): string {
  const { bg } = fillFor(spot.kind);
  const name = spot.extraData?.name ?? `钓点 ${index + 1}`;
  const kindLabel = fishingSpotKindLabel(spot.kind);
  const ariaLabel = `${name} · ${kindLabel}`;
  return `
    <div
      class="fish-marker"
      data-kind="${spot.kind ?? "unknown"}"
      data-marker-index="${index}"
      role="button"
      tabindex="0"
      aria-label="${ariaLabel.replace(/"/g, "&quot;")}"
      style="
        width:38px;
        height:38px;
        display:flex;
        align-items:center;
        justify-content:center;
        cursor:pointer;
        transform:rotate(-45deg);
        transform-origin:center;
        border-radius:50% 50% 50% 0;
        background-color:#ffffff;
        box-shadow:0 0 0 2px #ffffff, 0 2px 6px color-mix(in oklch, #000 22%, transparent);
      "
    >
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${bg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-fish-symbol-icon lucide-fish-symbol"><path d="M2 16s9-15 20-4C11 23 2 8 2 8"/></svg>
    </div>
  `;
}

/** Hover preview InfoWindow HTML content. */
export function makeHoverPreviewHtml(spot: MapMarker): string {
  const name = spot.extraData?.name || "未命名钓点";
  const kindLabel = fishingSpotKindLabel(spot.kind);
  return `
    <div class="fish-preview-card" style="
      padding:10px 12px;
      min-width:160px;
      max-width:240px;
      border-radius:10px;
      box-shadow:0 6px 18px color-mix(in oklch, var(--ink) 14%, transparent);
      font-family:var(--font-sans, system-ui);
    ">
      <div style="font-size:14px;font-weight:600;line-height:1.3;">${escapeHtml(name)}</div>
      <div style="font-size:12px;margin-top:4px;line-height:1.4;color:var(--muted);">
        <span>${escapeHtml(kindLabel)}</span>
      </div>
    </div>
  `;
}

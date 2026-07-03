// Page topology mapping. Collect section-level signals from a rendered page,
// then interpret them into structured topology data. The browser-side collector
// is self-contained. Interpretation is pure so it stays testable without a
// browser, following the same split profile-stack.ts uses.

import type { Page } from "playwright";

/** CSS position value reported for a section. */
export type PositionType = "static" | "relative" | "absolute" | "fixed" | "sticky";

/** One top-level section/block in the page layout. */
export interface PageSection {
  /** 0-based visual order in the DOM. */
  index: number;
  tag: string;
  /** Element id attribute, if any. */
  id: string | null;
  /** First 3 class names, space-separated. */
  classes: string;
  /** ARIA role or implicit semantic role (nav, main, header, footer, section, div, etc.). */
  role: string;
  position: PositionType;
  zIndex: string;
  isFixed: boolean;
  isSticky: boolean;
  /** Approximate rendered height in px. */
  height: number;
  /** True when the section is taller than the viewport (likely a full-screen section). */
  isFullScreen: boolean;
}

/** Raw signals from the browser collector. */
export interface RawTopologySignals {
  sections: Array<{
    index: number;
    tag: string;
    id: string | null;
    classes: string;
    role: string;
    position: string;
    zIndex: string;
    height: number;
    viewportHeight: number;
  }>;
  hasScrollSnap: boolean;
}

/** The interpreted page topology. */
export interface PageTopology {
  sections: PageSection[];
  /** True when the page uses CSS scroll-snap (affects how builders implement scroll behavior). */
  hasScrollSnap: boolean;
  /** Total section count. */
  count: number;
}

/**
 * Runs in the browser. Collects top-level section elements and scroll-snap
 * signals. Cannot reference module scope: it is serialized into the page.
 */
function collectTopologySignals(): RawTopologySignals {
  // Prefer direct children of <main>; fall back to <body> children when
  // <main> is absent or has fewer than 2 children.
  const mainEl = document.querySelector("main");
  const mainChildren = mainEl
    ? Array.from(mainEl.children)
    : [];
  let container: Element =
    mainEl && mainChildren.length >= 2
      ? mainEl
      : document.body;

  // Zone-div sites (most hydrated SPAs) wrap the whole page in a single
  // hydration-root / app-shell div, so the top level has exactly one child
  // spanning the full document height and topology collapses to one giant
  // "section". Descend through such single-child wrappers until real
  // siblings appear, bounded so pathological markup can't loop forever.
  for (let i = 0; i < 5; i++) {
    const kids = Array.from(container.children);
    if (kids.length !== 1) break;
    const [only] = kids;
    if (only.children.length < 2) break;
    container = only;
  }

  const children = Array.from(container.children);

  const viewportHeight = window.innerHeight;

  const sections = children
    .filter((el): el is Element => el.nodeType === Node.ELEMENT_NODE)
    .map((el, index) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      const classList = Array.from(el.classList).slice(0, 3).join(" ");
      const role =
        el.getAttribute("role") ?? el.tagName.toLowerCase();

      return {
        index,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: classList,
        role,
        position: style.position,
        zIndex: style.zIndex,
        height: rect.height,
        viewportHeight,
      };
    });

  const docSnap = getComputedStyle(document.documentElement).scrollSnapType;
  const bodySnap = getComputedStyle(document.body).scrollSnapType;
  const hasScrollSnap =
    (docSnap !== "none" && docSnap !== "") ||
    (bodySnap !== "none" && bodySnap !== "");

  return { sections, hasScrollSnap };
}

const VALID_POSITIONS = new Set<PositionType>([
  "static",
  "relative",
  "absolute",
  "fixed",
  "sticky",
]);

function toPositionType(raw: string): PositionType {
  if (VALID_POSITIONS.has(raw as PositionType)) return raw as PositionType;
  return "static";
}

/**
 * Map raw topology signals to interpreted PageTopology. Pure: no browser,
 * no network. Safe to call in unit tests with mock signals.
 */
export function interpretTopology(signals: RawTopologySignals): PageTopology {
  const sections: PageSection[] = signals.sections.map((raw) => {
    const position = toPositionType(raw.position);
    const isFixed = position === "fixed";
    const isSticky = position === "sticky";
    const isFullScreen = raw.height >= raw.viewportHeight * 0.85;

    return {
      index: raw.index,
      tag: raw.tag,
      id: raw.id,
      classes: raw.classes,
      role: raw.role,
      position,
      zIndex: raw.zIndex,
      isFixed,
      isSticky,
      height: raw.height,
      isFullScreen,
    };
  });

  return { sections, hasScrollSnap: signals.hasScrollSnap, count: sections.length };
}

/** Load nothing new: map the topology of the page already open in `page`. */
export async function mapPageTopology(page: Page): Promise<PageTopology> {
  const signals = await page.evaluate(collectTopologySignals);
  return interpretTopology(signals);
}

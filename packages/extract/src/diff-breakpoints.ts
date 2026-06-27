// Gap-H: document which layout properties change at each breakpoint for
// specific selectors. Automates the kind of "column→stack at 768px" note
// that the ai-website-cloner-template records manually.

import type { Page } from "playwright";

const LAYOUT_PROPS = [
  "display",
  "flexDirection",
  "flexWrap",
  "gridTemplateColumns",
  "gridTemplateRows",
  "width",
  "maxWidth",
  "minWidth",
  "height",
  "maxHeight",
  "minHeight",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "rowGap",
  "columnGap",
  "position",
  "overflow",
  "overflowX",
  "overflowY",
  "visibility",
  "opacity",
] as const;

export type LayoutPropName = (typeof LAYOUT_PROPS)[number];

export interface LayoutSnapshot {
  breakpoint: number;
  selector: string;
  properties: Partial<Record<LayoutPropName, string>>;
}

export interface LayoutChange {
  property: LayoutPropName;
  /** The breakpoint where this change was first observed (narrower breakpoint). */
  atBreakpoint: number;
  from: string;
  to: string;
}

export interface SelectorBreakpointDiff {
  selector: string;
  snapshots: LayoutSnapshot[];
  /** Changes ordered by breakpoint desc then property asc. */
  changes: LayoutChange[];
}

export interface DiffBreakpointsOptions {
  /** Viewport breakpoints in px, widest first. Defaults to [1440, 768, 390]. */
  breakpoints?: number[];
  /** Viewport height in px. Defaults to 900. */
  viewportHeight?: number;
}

/** Runs in the browser. Reads computed layout properties for a selector. */
function collectLayoutProps({
  selector,
  props,
}: {
  selector: string;
  props: readonly string[];
}): Record<string, string> {
  const el = document.querySelector(selector);
  if (!el) return {};
  const cs = getComputedStyle(el);
  const result: Record<string, string> = {};
  const SKIP = new Set(["none", "normal", "auto", "0px", ""]);
  for (const prop of props) {
    const val = cs.getPropertyValue(
      prop.replace(/([A-Z])/g, (c) => "-" + c.toLowerCase()),
    );
    if (val !== undefined && !SKIP.has(val.trim())) {
      result[prop] = val.trim();
    }
  }
  return result;
}

/**
 * Pure: diff a set of snapshots (widest first) and return the layout changes.
 * De-duplicates: if the same property changes at multiple narrower breakpoints,
 * only the narrowest (last) change is kept.
 */
export function diffLayoutSnapshots(snapshots: LayoutSnapshot[]): LayoutChange[] {
  if (snapshots.length < 2) return [];

  // Map<property, LayoutChange>: last write wins (narrowest breakpoint).
  const seen = new Map<LayoutPropName, LayoutChange>();

  for (let i = 0; i < snapshots.length - 1; i++) {
    const wider = snapshots[i];
    const narrower = snapshots[i + 1];

    const allProps = new Set<LayoutPropName>([
      ...(Object.keys(wider.properties) as LayoutPropName[]),
      ...(Object.keys(narrower.properties) as LayoutPropName[]),
    ]);

    for (const prop of allProps) {
      const from = wider.properties[prop] ?? "";
      const to = narrower.properties[prop] ?? "";
      if (from !== to) {
        seen.set(prop, {
          property: prop,
          atBreakpoint: narrower.breakpoint,
          from,
          to,
        });
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    if (b.atBreakpoint !== a.atBreakpoint) return b.atBreakpoint - a.atBreakpoint;
    return a.property.localeCompare(b.property);
  });
}

/**
 * For each breakpoint (widest first): set the viewport, navigate to url,
 * and snapshot the computed layout properties for each selector.
 * Returns one SelectorBreakpointDiff per selector.
 */
export async function diffBreakpoints(
  page: Page,
  url: string,
  selectors: string[],
  options: DiffBreakpointsOptions = {},
): Promise<SelectorBreakpointDiff[]> {
  const { breakpoints = [1440, 768, 390], viewportHeight = 900 } = options;

  // snapshotsBySelector[selector] = LayoutSnapshot[] ordered widest first
  const snapshotsBySelector = new Map<string, LayoutSnapshot[]>(
    selectors.map((s) => [s, []]),
  );

  for (const bp of breakpoints) {
    await page.setViewportSize({ width: bp, height: viewportHeight });
    await page.goto(url, { waitUntil: "load" });

    for (const selector of selectors) {
      const props = await page.evaluate(collectLayoutProps, {
        selector,
        props: [...LAYOUT_PROPS],
      });
      const snapshot: LayoutSnapshot = {
        breakpoint: bp,
        selector,
        properties: props as Partial<Record<LayoutPropName, string>>,
      };
      snapshotsBySelector.get(selector)!.push(snapshot);
    }
  }

  return selectors.map((selector) => {
    const snapshots = snapshotsBySelector.get(selector)!;
    return {
      selector,
      snapshots,
      changes: diffLayoutSnapshots(snapshots),
    };
  });
}

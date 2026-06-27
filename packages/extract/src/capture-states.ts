// Gap-B: multi-state CSS diff: capture element styles before and after a
// scroll or click trigger, then produce a structured property-level diff.
// Designed for the private pipeline that documents interaction-driven CSS changes.

import type { Page } from "playwright";

/** The 40 computed CSS properties observed across state captures. */
const STATE_PROPS = [
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "color",
  "textTransform",
  "textDecoration",
  "backgroundColor",
  "background",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "width",
  "height",
  "maxWidth",
  "minWidth",
  "maxHeight",
  "minHeight",
  "display",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "gap",
  "gridTemplateColumns",
  "gridTemplateRows",
  "borderRadius",
  "border",
  "borderTop",
  "borderBottom",
  "borderLeft",
  "borderRight",
  "boxShadow",
  "overflow",
  "overflowX",
  "overflowY",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
  "opacity",
  "transform",
  "transition",
  "cursor",
  "objectFit",
  "objectPosition",
  "mixBlendMode",
  "filter",
  "backdropFilter",
  "whiteSpace",
  "textOverflow",
] as const;

export type StatePropName = (typeof STATE_PROPS)[number];
export type ElementStyles = Partial<Record<StatePropName, string>>;

/** Snapshot of computed styles on one element at one moment. */
export interface ElementState {
  selector: string;
  styles: ElementStyles;
}

/** One property that changed between two states. */
export interface CssDiff {
  property: StatePropName;
  before: string;
  after: string;
}

/** The full before→after diff for one element. */
export interface StateDiff {
  selector: string;
  diffs: CssDiff[];
}

export interface CaptureOptions {
  /** ms to wait after triggering the state change before capturing. Defaults to 400. */
  waitMs?: number;
}

/**
 * Pure: diff two ElementState snapshots of the same element.
 * Returns only the properties that changed; ignores both-undefined / both-empty pairs.
 */
export function diffStates(
  before: ElementState,
  after: ElementState,
): StateDiff {
  const diffs: CssDiff[] = [];
  for (const prop of STATE_PROPS) {
    const a = before.styles[prop] ?? "";
    const b = after.styles[prop] ?? "";
    if (a === b) continue;
    // Ignore pairs where both are absent/empty.
    if (a === "" && b === "") continue;
    diffs.push({ property: prop, before: a, after: b });
  }
  return { selector: before.selector, diffs };
}

/**
 * Playwright: snapshot the computed styles of a CSS selector on the current page.
 * Properties with empty/null values are omitted from the returned record.
 */
export async function snapshotElementStyles(
  page: Page,
  selector: string,
): Promise<ElementState> {
  const styles = await page.evaluate(
    (args: { sel: string; props: readonly string[] }): Record<string, string> => {
      const el = document.querySelector(args.sel);
      if (!el) return {};
      const computed = window.getComputedStyle(el);
      const result: Record<string, string> = {};
      for (const prop of args.props) {
        const value = computed.getPropertyValue(
          prop.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`),
        );
        if (value != null && value !== "") {
          result[prop] = value;
        }
      }
      return result;
    },
    { sel: selector, props: STATE_PROPS as unknown as string[] },
  );
  return { selector, styles: styles as ElementStyles };
}

/**
 * Playwright: scroll the page to scrollY, wait for animations to settle,
 * then snapshot the element's computed styles.
 */
export async function captureScrollState(
  page: Page,
  selector: string,
  scrollY: number,
  options: CaptureOptions = {},
): Promise<ElementState> {
  const waitMs = options.waitMs ?? 400;
  await page.evaluate((y: number) => window.scrollTo(0, y), scrollY);
  await page.waitForTimeout(waitMs);
  return snapshotElementStyles(page, selector);
}

/**
 * Playwright: click a trigger element, wait for animations to settle,
 * then snapshot the observed element's computed styles.
 */
export async function captureClickState(
  page: Page,
  selector: string,
  triggerSelector: string,
  options: CaptureOptions = {},
): Promise<ElementState> {
  const waitMs = options.waitMs ?? 400;
  await page.click(triggerSelector);
  await page.waitForTimeout(waitMs);
  return snapshotElementStyles(page, selector);
}

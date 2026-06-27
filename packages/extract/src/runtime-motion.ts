// Runtime motion capture via the Web Animations API (document.getAnimations()).
//
// This is the runtime counterpart to animations.ts. Where animations.ts reads
// the STATIC computed transition/animation longhands + @keyframes, this reads
// what is ACTUALLY animating at snapshot time: including JS-driven and WAAPI
// (element.animate()) motion that never appears as a CSS transition/animation
// longhand. Animated property names are reused through classifyProperties() so
// runtime motion gets the same compositor/paint/layout performance-smell scoring.

import type { Page } from "playwright";
import { classifyProperties, type AnimatedProperties } from "./animations.js";

/** One animation live on the document timeline at capture time. */
export interface RuntimeAnimation {
  /** Animation.id when set (often the CSS animation-name); "" for anonymous WAAPI animations. */
  id: string;
  /** Animated property names (kebab-case), from the effect's keyframes. */
  properties: string[];
  /** Effect duration in ms, or null when it is not a finite number (e.g. "auto"). */
  durationMs: number | null;
  /** WAAPI play state: "running" | "paused" | "finished" | "idle". */
  playState: string;
}

/** Runtime motion snapshot (CSS animations + WAAPI + JS-driven), property-classified. */
export interface RuntimeMotion {
  /** Each animation live on the document timeline at capture time. */
  animations: RuntimeAnimation[];
  /** Aggregate animated properties classified by render cost (performance smells). */
  properties: AnimatedProperties;
}

/** Runs in the browser. Snapshots every live animation via the Web Animations API. */
function collectRuntimeMotion(): { animations: RuntimeAnimation[] } {
  // Keys on a computed keyframe that are NOT animated properties.
  const META = new Set(["offset", "computedOffset", "easing", "composite"]);
  const toKebab = (k: string) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

  // document.getAnimations() is Web Animations 2 and may be absent in older
  // engines; guard without assuming the lib.dom typing has it.
  const doc = document as Document & { getAnimations?: () => Animation[] };
  const list = typeof doc.getAnimations === "function" ? doc.getAnimations() : [];

  const animations: RuntimeAnimation[] = [];
  for (const a of list) {
    const effect = a.effect as KeyframeEffect | null;
    if (!effect || typeof effect.getKeyframes !== "function") continue;

    const props = new Set<string>();
    for (const kf of effect.getKeyframes()) {
      for (const key of Object.keys(kf)) {
        if (!META.has(key)) props.add(toKebab(key));
      }
    }

    const timing = effect.getTiming();
    animations.push({
      id: a.id || "",
      properties: [...props],
      durationMs: typeof timing.duration === "number" ? timing.duration : null,
      playState: a.playState,
    });
  }
  return { animations };
}

/**
 * Capture runtime motion from the page currently loaded in `page`. This is a
 * point-in-time snapshot: infinite animations read as "running"; finite ones may
 * already be "finished". Aggregate animated properties are classified for smells.
 */
export async function extractRuntimeMotion(page: Page): Promise<RuntimeMotion> {
  const { animations } = await page.evaluate(collectRuntimeMotion);
  const everyProp = animations.flatMap((a) => a.properties);
  return { animations, properties: classifyProperties(everyProp) };
}

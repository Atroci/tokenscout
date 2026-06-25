// Pure tests for detectMotion (no browser). Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMotion } from "../src/detect-motion.js";

const empty = {
  globals: [] as string[],
  hasLottiePlayer: false,
  lottieSources: [] as string[],
  aosEffects: [] as string[],
  domMarkers: [] as string[],
  scrollLibraries: [] as string[],
  hasScrollSnap: false,
};

test("detectMotion: a GSAP global is a high-confidence hit", () => {
  const r = detectMotion({ ...empty, globals: ["gsap", "TweenMax"] });
  assert.deepEqual(r.libraries, [{ name: "GSAP", confidence: "high" }]);
});

test("detectMotion: data-aos without the AOS global is medium confidence", () => {
  const r = detectMotion({
    ...empty,
    aosEffects: ["fade-up", "fade-up", "zoom-in"],
  });
  assert.deepEqual(r.libraries, [{ name: "AOS", confidence: "medium" }]);
  assert.equal(r.aos.count, 3);
  assert.deepEqual(r.aos.effects, ["fade-up", "zoom-in"]);
});

test("detectMotion: the AOS global upgrades AOS to high confidence", () => {
  const r = detectMotion({
    ...empty,
    globals: ["AOS"],
    aosEffects: ["fade-up"],
  });
  assert.deepEqual(r.libraries, [{ name: "AOS", confidence: "high" }]);
});

test("detectMotion: lottie-player and sources mark Lottie present", () => {
  const r = detectMotion({
    ...empty,
    hasLottiePlayer: true,
    lottieSources: ["/a/hero.json", "/a/hero.json", "/b/icon.json"],
  });
  assert.ok(r.libraries.some((l) => l.name === "Lottie"));
  assert.equal(r.lottie.present, true);
  assert.deepEqual(r.lottie.sources, ["/a/hero.json", "/b/icon.json"]);
});

test("detectMotion: a data-framer marker is a medium Framer Motion hit", () => {
  const r = detectMotion({ ...empty, domMarkers: ["data-framer"] });
  assert.deepEqual(r.libraries, [
    { name: "Framer Motion", confidence: "medium" },
  ]);
});

test("detectMotion: libraries are de-duplicated and sorted by name", () => {
  const r = detectMotion({
    ...empty,
    globals: ["ScrollMagic", "anime", "gsap"],
  });
  assert.deepEqual(
    r.libraries.map((l) => l.name),
    ["GSAP", "ScrollMagic", "anime.js"],
  );
});

test("detectMotion: an inert page yields no libraries", () => {
  const r = detectMotion(empty);
  assert.deepEqual(r.libraries, []);
  assert.equal(r.lottie.present, false);
  assert.equal(r.aos.count, 0);
  assert.deepEqual(r.scrollLibraries, []);
  assert.equal(r.hasScrollSnap, false);
});

// gap-F: scroll library detection tests
test("detectMotion: lenis in globals is a high-confidence Lenis hit", () => {
  const r = detectMotion({ ...empty, globals: ["lenis"] });
  assert.deepEqual(r.scrollLibraries, [{ name: "Lenis", confidence: "high" }]);
  assert.deepEqual(r.libraries, []);
});

test("detectMotion: data-locomotive-scroll DOM marker is medium-confidence Locomotive Scroll", () => {
  const r = detectMotion({
    ...empty,
    domMarkers: ["data-locomotive-scroll"],
  });
  assert.deepEqual(r.scrollLibraries, [
    { name: "Locomotive Scroll", confidence: "medium" },
  ]);
});

test("detectMotion: hasScrollSnap is forwarded to the report", () => {
  const r = detectMotion({ ...empty, hasScrollSnap: true });
  assert.equal(r.hasScrollSnap, true);
  assert.deepEqual(r.scrollLibraries, []);
});

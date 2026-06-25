// Pure mapping tests for interpretTopology(). No browser. Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interpretTopology,
  type RawTopologySignals,
} from "../src/map-topology.js";

/** Minimal raw section with sane defaults. */
function rawSection(
  overrides: Partial<RawTopologySignals["sections"][number]> = {},
): RawTopologySignals["sections"][number] {
  return {
    index: 0,
    tag: "section",
    id: null,
    classes: "",
    role: "section",
    position: "static",
    zIndex: "auto",
    height: 200,
    viewportHeight: 800,
    ...overrides,
  };
}

test("interpretTopology: fixed section sets isFixed:true, isSticky:false", () => {
  const signals: RawTopologySignals = {
    sections: [rawSection({ position: "fixed" })],
    hasScrollSnap: false,
  };
  const topology = interpretTopology(signals);
  assert.equal(topology.sections[0]!.isFixed, true);
  assert.equal(topology.sections[0]!.isSticky, false);
});

test("interpretTopology: sticky section sets isSticky:true, isFixed:false", () => {
  const signals: RawTopologySignals = {
    sections: [rawSection({ position: "sticky" })],
    hasScrollSnap: false,
  };
  const topology = interpretTopology(signals);
  assert.equal(topology.sections[0]!.isSticky, true);
  assert.equal(topology.sections[0]!.isFixed, false);
});

test("interpretTopology: height >= 85% of viewport → isFullScreen:true", () => {
  // 680 >= 800 * 0.85 (680)
  const signals: RawTopologySignals = {
    sections: [rawSection({ height: 680, viewportHeight: 800 })],
    hasScrollSnap: false,
  };
  const topology = interpretTopology(signals);
  assert.equal(topology.sections[0]!.isFullScreen, true);
});

test("interpretTopology: height < 85% of viewport → isFullScreen:false", () => {
  // 400 < 800 * 0.85 (680)
  const signals: RawTopologySignals = {
    sections: [rawSection({ height: 400, viewportHeight: 800 })],
    hasScrollSnap: false,
  };
  const topology = interpretTopology(signals);
  assert.equal(topology.sections[0]!.isFullScreen, false);
});

test("interpretTopology: hasScrollSnap and count pass through correctly", () => {
  const signals: RawTopologySignals = {
    sections: [
      rawSection({ index: 0 }),
      rawSection({ index: 1, tag: "div" }),
      rawSection({ index: 2, tag: "footer" }),
    ],
    hasScrollSnap: true,
  };
  const topology = interpretTopology(signals);
  assert.equal(topology.hasScrollSnap, true);
  assert.equal(topology.count, 3);
  assert.equal(topology.sections.length, 3);
});

// Pure logic tests for the text-content extraction helpers. No browser needed.
// We exercise the invariants that collectContent() enforces by simulating its
// filtering rules on plain arrays — the same approach harvest-assets.test.ts uses
// for buildAssetManifest().
import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Minimal DOM-like stubs so we can run the pure logic in Node.
// ---------------------------------------------------------------------------

interface FakeElement {
  tagName: string;
  className: string;
  childNodes: Array<{ nodeType: number; textContent: string }>;
  children: FakeElement[];
  parentElement: { children: FakeElement[] } | null;
}

/** Reproduce the collectContent text-node filtering rule inline. */
function filterTextNodes(
  elements: FakeElement[],
  maxTexts: number,
): Array<{ selector: string; text: string }> {
  const texts: Array<{ selector: string; text: string }> = [];

  for (const el of elements) {
    if (texts.length >= maxTexts) break;

    const textChildren = el.childNodes.filter(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    const nonTextChildren = el.childNodes.filter(
      (n) => n.nodeType !== 3 && n.nodeType !== 8,
    );

    if (textChildren.length !== 1 || nonTextChildren.length !== 0) continue;

    const rawText = textChildren[0].textContent.trim();
    if (rawText.length === 0) continue;

    const tag = el.tagName.toLowerCase();
    const firstClass = el.className.trim().split(/\s+/)[0] ?? "";
    const classStr = firstClass ? "." + firstClass : "";

    let nth = 1;
    if (el.parentElement) {
      for (const sibling of el.parentElement.children) {
        if (sibling === el) break;
        if (sibling.tagName === el.tagName) nth++;
      }
    }

    texts.push({ selector: `${tag}${classStr}:nth-of-type(${nth})`, text: rawText.slice(0, 500) });
  }

  return texts;
}

/** De-duplicate aria-label values, same rule as collectContent(). */
function dedupeAriaLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of labels) {
    const t = l.trim();
    if (t.length > 0 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("filterTextNodes: collects element with exactly one direct text-node child", () => {
  const parent: FakeElement = {
    tagName: "P",
    className: "intro",
    childNodes: [{ nodeType: 3, textContent: "Hello world" }],
    children: [],
    parentElement: null,
  };

  const result = filterTextNodes([parent], 200);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "Hello world");
  assert.equal(result[0].selector, "p.intro:nth-of-type(1)");
});

test("filterTextNodes: skips element that has non-text children (mixed content)", () => {
  const mixed: FakeElement = {
    tagName: "DIV",
    className: "",
    childNodes: [
      { nodeType: 3, textContent: "text" },
      { nodeType: 1, textContent: "<span>" }, // element child — should cause skip
    ],
    children: [],
    parentElement: null,
  };

  const result = filterTextNodes([mixed], 200);
  assert.equal(result.length, 0);
});

test("filterTextNodes: respects maxTexts limit", () => {
  const makeEl = (text: string): FakeElement => ({
    tagName: "P",
    className: "",
    childNodes: [{ nodeType: 3, textContent: text }],
    children: [],
    parentElement: null,
  });

  const elements = [makeEl("one"), makeEl("two"), makeEl("three")];
  const result = filterTextNodes(elements, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].text, "one");
  assert.equal(result[1].text, "two");
});

test("dedupeAriaLabels: removes duplicate values, preserves insertion order", () => {
  const input = ["Close", "Close", "Open menu", "Close", "Open menu", "Help"];
  const result = dedupeAriaLabels(input);
  assert.deepEqual(result, ["Close", "Open menu", "Help"]);
});

test("filterTextNodes: text is truncated at 500 chars", () => {
  const longText = "a".repeat(600);
  const el: FakeElement = {
    tagName: "P",
    className: "",
    childNodes: [{ nodeType: 3, textContent: longText }],
    children: [],
    parentElement: null,
  };

  const [node] = filterTextNodes([el], 200);
  assert.equal(node.text.length, 500);
});

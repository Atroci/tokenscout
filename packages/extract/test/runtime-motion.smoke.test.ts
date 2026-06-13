// Runtime-motion smoke test against real Chromium. Imports the built output
// (Playwright serializes the page-side collector; tsx/esbuild would inject a
// `__name` helper undefined in the browser). Requires a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { extractRuntimeMotion } from "../dist/index.js";

const html = `<!doctype html><html><head><style>
  @keyframes spin { to { transform: rotate(360deg) } }
  .css { width:40px;height:40px;background:red;animation: spin 2s linear infinite; }
</style></head><body>
  <div class="css"></div><div id="js" style="width:40px;height:40px;background:blue"></div>
  <script>
    document.getElementById('js').animate(
      [{ marginLeft: '0px' }, { marginLeft: '100px' }],
      { duration: 500, iterations: Infinity }
    );
  </script>
</body></html>`;
const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);

test("extractRuntimeMotion: captures CSS + WAAPI motion and classifies properties", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "load" });
    const motion = await extractRuntimeMotion(page);

    assert.ok(
      motion.animations.length >= 2,
      "CSS spin + WAAPI margin animation are both live",
    );
    const props = motion.animations.flatMap((a) => a.properties);
    assert.ok(props.includes("transform"), "CSS animation transform captured");
    assert.ok(props.includes("margin-left"), "WAAPI margin-left captured (static read misses this)");
    // transform composites (good); margin-left forces layout (the smell).
    assert.ok(motion.properties.composited.includes("transform"));
    assert.ok(motion.properties.layout.includes("margin-left"));
  } finally {
    await browser.close();
  }
});

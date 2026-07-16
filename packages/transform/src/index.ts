// @tokenscout/transform: render a DTCG token document as a drop-in CSS or
// Tailwind config file. Zero runtime deps beyond `tokenscout` itself (types
// only — pure functions over plain data, same posture as core).

export { transform, type TransformFormat } from "./transform.js";
export { renderCssVars } from "./css-vars.js";
export { renderTailwindConfig } from "./tailwind.js";

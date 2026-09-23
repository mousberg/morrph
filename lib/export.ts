/**
 * Turns a loop of icons into a self-playing SVG.
 *
 * The page morphs with JavaScript, but an export should not need any: it should work as an <img>, pasted into HTML,
 * or as a React component. So the loop is written as SMIL, the animation built into SVG itself.
 *
 * Each morph in the loop becomes one <path>, and only one is visible at a time. SMIL can only animate a path between
 * shapes with identical structure, which is why collapsed loops are kept as points instead of dropped. Between the
 * moments where parts start or stop collapsing, every point moves in a straight line, so a handful of keyframes with
 * the right easing between them reproduces the page's motion. The only difference is the point thinning below, which
 * stays within a fraction of a pixel at every keyframe.
 */

import { cubic, iconPath, pairUp, pointsAt, solve, type Icon, type Pair } from "./morph";
import { DURATION, EASE, HOLD } from "./timing";

type Anim = { attr: "d" | "opacity" | "fill-rule"; discrete: boolean; times: number[]; values: string[]; splines?: string[] };
type Layer = { d: string; visible: boolean; rule: Icon["rule"]; anims: Anim[] };

/** A whole loop, ready to be written out as SVG or JSX. */
export type Animation = { cycle: number; layers: Layer[] };

const LINEAR = "0 0 1 1";
const [X1, Y1, X2, Y2] = EASE;

/** The time within one morph (0 to 1) at which it reaches a given progress. */
const timeAt = (progress: number) => cubic(X1, X2, solve(Y1, Y2, progress));

/**
 * The easing between two progress points, as a keySpline. It is the same curve, cut to that stretch and rescaled to a
 * unit box (blossoming gives the control points of a piece of a cubic bezier).
 */
function spline(p0: number, p1: number) {
  const s0 = solve(Y1, Y2, p0), s1 = solve(Y1, Y2, p1);
  const piece = (c1: number, c2: number) => {
    const c = [0, c1, c2, 1];
    const blossom = (u: number, v: number, w: number) => {
      const a = [0, 1, 2].map((i) => c[i] + (c[i + 1] - c[i]) * u);
      const b = [0, 1].map((i) => a[i] + (a[i + 1] - a[i]) * v);
      return b[0] + (b[1] - b[0]) * w;
    };
    const pts = [blossom(s0, s0, s0), blossom(s0, s0, s1), blossom(s0, s1, s1), blossom(s1, s1, s1)];
    const span = pts[3] - pts[0] || 1;
    return [(pts[1] - pts[0]) / span, (pts[2] - pts[0]) / span];
  };
  const [x1, x2] = piece(X1, X2), [y1, y2] = piece(Y1, Y2);
  return [x1, y1, x2, y2].map((v) => +Math.min(1, Math.max(0, v)).toFixed(4)).join(" ");
}

// ---------- keeping the file small ----------

/** How far, in the 100-unit box, a dropped point may sit from the outline it leaves behind: a fraction of a pixel. */
const TOLERANCE = 0.06;

/** Distance from p to segment ab. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * Which points of a loop can go. Douglas-Peucker, but a point only goes if it is redundant in every keyframe at once,
 * because all frames must keep the same points for the animation to work. Straight runs shrink to their two ends.
 */
function keepers(frames: Float64Array[]) {
  const n = frames[0].length / 2;
  const keep = new Uint8Array(n + 1); // index n is point 0 again, closing the loop
  const at = (f: Float64Array, i: number) => (i === n ? 0 : i) * 2;
  const error = (k: number, i: number, j: number) => {
    let worst = 0;
    for (const f of frames) {
      const [pk, pi, pj] = [at(f, k), at(f, i), at(f, j)];
      worst = Math.max(worst, toSegment(f[pk], f[pk + 1], f[pi], f[pi + 1], f[pj], f[pj + 1]));
    }
    return worst;
  };
  // Split the loop at point 0 and the point farthest from it, then simplify each half.
  let far = 1, farD = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.max(...frames.map((f) => Math.hypot(f[2 * i] - f[0], f[2 * i + 1] - f[1])));
    if (d > farD) { farD = d; far = i; }
  }
  keep[0] = keep[far] = keep[n] = 1;
  const stack: [number, number][] = [[0, far], [far, n]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = 0, split = -1;
    for (let k = i + 1; k < j; k++) { const e = error(k, i, j); if (e > worst) { worst = e; split = k; } }
    if (worst > TOLERANCE) { keep[split] = 1; stack.push([i, split], [split, j]); }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

/** 12.3 → "12.3", 0.4 → ".4", -0.4 → "-.4": the shortest spelling SVG accepts. */
const num = (tenths: number) => (tenths / 10).toString().replace(/^(-?)0\./, "$1.");

/**
 * Writes one keyframe per progress point. Each loop is a moveto then relative linetos. Rounding happens on the
 * absolute positions before the steps are taken, so rounding never adds up along the outline.
 */
function encodeFrames(pairs: Pair[], breaks: number[]) {
  const out = breaks.map(() => "");
  for (const pair of pairs) {
    const frames = breaks.map((p) => pointsAt(pair, p));
    const kept = keepers(frames);
    frames.forEach((f, fi) => {
      let d = "", prev = "";
      const put = (v: number) => {
        const s = num(v);
        // A separator is only needed when the next number could be read as part of the last one.
        const glue = !prev || /[a-zA-Z]$/.test(d) || s[0] === "-" || (s[0] === "." && prev.includes(".")) ? "" : " ";
        d += glue + s;
        prev = s;
      };
      let px = 0, py = 0;
      kept.forEach((i, k) => {
        const x = Math.round(f[2 * i] * 10), y = Math.round(f[2 * i + 1] * 10);
        if (k === 0) { d += "M"; put(x); put(y); d += "l"; prev = ""; }
        else { put(x - px); put(y - py); }
        px = x; py = y;
      });
      out[fi] += d + "z";
    });
  }
  return out;
}

/** Builds the loop icon 1 → 2 → … → n → 1, with the same timing as the page. */
export function buildAnimation(icons: Icon[]): Animation {
  const n = icons.length;
  if (n === 1) return { cycle: 0, layers: [{ d: iconPath(icons[0]), visible: true, rule: icons[0].rule, anims: [] }] };

  const step = HOLD + DURATION;
  const cycle = n * step;
  const startOf = (i: number) => i * step + HOLD; // each icon rests first, then morphs to the next

  const layers = icons.map((from, i): Layer => {
    const to = icons[(i + 1) % n];
    const pairs = pairUp(from, to);
    const last = i === n - 1; // the morph back to the first icon, which also shows it while the loop starts over

    // Keyframes at every progress where some part starts or stops collapsing (see the spans in pairUp).
    const breaks = [...new Set([0, 1, ...pairs.flatMap((p) => p.span)])].sort((a, b) => a - b);
    const frames = encodeFrames(pairs, breaks);
    const start = startOf(i);

    const d: Anim = { attr: "d", discrete: false, times: [0], values: [last ? frames.at(-1)! : frames[0]], splines: [] };
    const key = (time: number, value: string, curve = LINEAR) => { d.times.push(time); d.values.push(value); d.splines!.push(curve); };
    if (last) {
      key(startOf(0), frames.at(-1)!); // shows the first icon until the first morph takes over,
      key(startOf(0) + 1, frames[0]); // then, hidden, jumps to its own start instead of drifting there
    }
    key(start, frames[0]);
    for (let j = 1; j < breaks.length; j++) key(start + DURATION * timeAt(breaks[j]), frames[j], spline(breaks[j - 1], breaks[j]));
    if (d.times.at(-1)! < cycle) key(cycle, frames.at(-1)!);

    const shownUntil = last ? startOf(0) : startOf(i + 1);
    const opacity: Anim = last
      ? { attr: "opacity", discrete: true, times: [0, shownUntil, start], values: ["1", "0", "1"] }
      : { attr: "opacity", discrete: true, times: [0, start, shownUntil], values: ["0", "1", "0"] };

    const anims = [d, opacity];
    // The fill rule flips halfway, once parts that only one icon has are out of the way.
    if (from.rule !== to.rule) {
      anims.push({ attr: "fill-rule", discrete: true, times: [0, start, start + DURATION * timeAt(0.5)], values: [to.rule, from.rule, to.rule] });
    }
    return { d: last ? frames.at(-1)! : frames[0], visible: last, rule: last ? to.rule : from.rule, anims };
  });
  return { cycle, layers };
}

// ---------- writing it out ----------

type Attr = [name: string, value: string | number];

// SMIL's attribute names are already camelCase, so SVG and JSX spell them the same way.
function animAttrs(a: Anim, cycle: number): Attr[] {
  const attrs: Attr[] = [
    ["attributeName", a.attr],
    ["dur", `${cycle}ms`],
    ["repeatCount", "indefinite"],
    ["calcMode", a.discrete ? "discrete" : "spline"],
    ["keyTimes", a.times.map((t) => +(t / cycle).toFixed(5)).join(";")],
  ];
  if (a.splines) attrs.push(["keySplines", a.splines.join(";")]);
  attrs.push(["values", a.values.join(";")]);
  return attrs;
}

const attrText = (attrs: Attr[]) => attrs.map(([k, v]) => `${k}="${v}"`).join(" ");

/** The <path> elements, written for SVG or for JSX. The two only differ in how `fill-rule` is spelled and closed. */
function writePaths(anim: Animation, jsx: boolean, indent: string) {
  const close = jsx ? " />" : "/>";
  return anim.layers
    .map((l) => {
      const own = attrText([["d", l.d], [jsx ? "fillRule" : "fill-rule", l.rule], ...(l.visible ? [] : ([["opacity", 0]] as Attr[]))]);
      if (!l.anims.length) return `${indent}<path ${own}${close}`;
      const kids = l.anims.map((a) => `${indent}  <animate ${attrText(animAttrs(a, anim.cycle))}${close}`).join("\n");
      return `${indent}<path ${own}>\n${kids}\n${indent}</path>`;
    })
    .join("\n");
}

/** Standalone SVG markup. `fill` defaults to currentColor, so inline SVG takes the text color around it. */
export function toSvg(anim: Animation, { fill = "currentColor" }: { fill?: string } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="${fill}" role="img" aria-label="Morphing icon">
${writePaths(anim, false, "  ")}
</svg>
`;
}

/** A dependency-free React component. It takes any <svg> prop, and it is colored by the CSS `color` around it. */
export function toReact(anim: Animation, name = "Morph") {
  return `/**
 * Made with Morrph. The animation is SMIL inside the SVG, so it needs no JavaScript and no dependencies.
 * Size it with width/height or className; color it with CSS \`color\`.
 */
import type { SVGProps } from "react";

export function ${name}(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" role="img" aria-label="Morphing icon" {...props}>
${writePaths(anim, true, "      ")}
    </svg>
  );
}
`;
}

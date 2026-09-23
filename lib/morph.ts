/**
 * Morphing between any two filled SVGs.
 *
 * Every icon becomes the same kind of thing: a list of closed loops, each a ring of points. Loops are paired between
 * the two icons, and a loop with no partner collapses to an invisible point at its own center. A morph is then just
 * every point sliding from one position to the other.
 *
 * Reading an SVG needs the browser (it measures real paths), so `loadIcon` only runs on the client.
 */

export type Loop = { pts: Float64Array; area: number; len: number; cx: number; cy: number };
export type Icon = { loops: Loop[]; rule: "evenodd" | "nonzero" };
export type Pair = { n: number; a: Float64Array; b: Float64Array; span: [number, number] };

const NS = "http://www.w3.org/2000/svg";
const BOX = 100; // every icon is fitted into the same 100×100 box, so any two line up
const DENSE = 1200; // points traced per loop when reading; pairs are resampled down from this

// ---------- path parsing: split a `d` string into absolute subpaths ----------

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function readNums(str: string, isArc: boolean) {
  const out: number[] = [];
  const re = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;
  let i = 0;
  let k = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === " " || c === "," || c === "\n" || c === "\t" || c === "\r") { i++; continue; }
    // Arc flags are single digits and may touch: "00" is two flags, not the number 0.
    if (isArc && (k % 7 === 3 || k % 7 === 4)) { out.push(+c); i++; k++; continue; }
    re.lastIndex = i;
    const m = re.exec(str);
    if (!m) { i++; continue; }
    out.push(parseFloat(m[0]));
    i = re.lastIndex;
    k++;
  }
  return out;
}

/** One `d` string in, one absolute `d` string per subpath out, so each outline can be measured on its own. */
export function splitSubpaths(d: string) {
  const subs: string[][] = [];
  let cur: string[] | null = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const f = (n: number) => +n.toFixed(4);
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const U = m[1].toUpperCase();
    const rel = m[1] !== U;
    if (U === "Z") { cur?.push("Z"); cur = null; cx = sx; cy = sy; continue; } // anything drawn next starts a new outline
    const nums = readNums(m[2], U === "A");
    const n = ARITY[U];
    for (let j = 0; j + n <= nums.length; j += n) {
      const a = nums.slice(j, j + n);
      const type = U === "M" && j > 0 ? "L" : U; // extra pairs after a moveto are linetos
      const ox = rel ? cx : 0, oy = rel ? cy : 0;
      if (type === "M") {
        cx = a[0] + ox; cy = a[1] + oy; sx = cx; sy = cy;
        cur = [`M${f(cx)} ${f(cy)}`];
        subs.push(cur);
        continue;
      }
      if (!cur) { cur = [`M${f(cx)} ${f(cy)}`]; subs.push(cur); }
      if (type === "H") { cx = a[0] + ox; cur.push(`L${f(cx)} ${f(cy)}`); }
      else if (type === "V") { cy = a[0] + oy; cur.push(`L${f(cx)} ${f(cy)}`); }
      else if (type === "A") {
        const x = a[5] + ox, y = a[6] + oy;
        cur.push(`A${a[0]} ${a[1]} ${a[2]} ${a[3]} ${a[4]} ${f(x)} ${f(y)}`);
        cx = x; cy = y;
      } else {
        const pts: number[] = [];
        for (let q = 0; q < n; q += 2) pts.push(f(a[q] + ox), f(a[q + 1] + oy));
        cur.push(type + pts.join(" "));
        cx = a[n - 2] + ox; cy = a[n - 1] + oy;
      }
    }
  }
  return subs.map((s) => s.join(""));
}

// ---------- reading an SVG ----------

/** Why an SVG could not become an icon, in words a person can act on. */
export class IconError extends Error {
  constructor(readonly reason: "invalid" | "empty") {
    super(reason === "invalid" ? "isn't a valid SVG" : "has no filled shapes (outline its strokes first)");
  }
}

const SHAPES = "path,circle,ellipse,rect,polygon,polyline";
const UNSAFE = "script,foreignObject,image,feImage,animate,animateMotion,animateTransform,set,iframe,embed,object";
const EXTERNAL_URL = /url\(\s*['"]?(?!#)[^)]*\)/gi;
const urlId = (v: string | null) => (v ?? "").match(/url\(\s*['"]?#([^'")\s]+)/)?.[1];

/**
 * Dropped files come from anywhere, and the SVG is briefly put in the page to be measured. Before that, everything
 * that could run code or fetch something is removed: scripts, embedded content, event handlers and outside links.
 */
function sanitize(root: Element) {
  root.querySelectorAll(UNSAFE).forEach((el) => el.remove());
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const { name, value } of [...el.attributes]) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on") || ((lower === "href" || lower.endsWith(":href")) && !value.startsWith("#"))) el.removeAttribute(name);
      else if (value.replace(EXTERNAL_URL, "") !== value) el.setAttribute(name, value.replace(EXTERNAL_URL, "none"));
    }
    if (el.localName === "style") el.textContent = (el.textContent ?? "").replace(/@import[^;]*;?/gi, "").replace(EXTERNAL_URL, "none");
  }
}

/**
 * Browsers hand back two kinds of matrix (SVGMatrix and DOMMatrix), and Chrome will not multiply one by the other.
 * Everything is turned into a DOMMatrix first.
 */
const matrix = (m: DOMMatrix2DInit) => DOMMatrix.fromMatrix(m);

/** The transform from el's coordinates up to `top`'s. Inside a mask the browser reports none, so it is added up by hand. */
function transformWithin(el: Element, top: Element) {
  let m = new DOMMatrix();
  for (let node: Element | null = el; node && node !== top; node = node.parentElement) {
    const own = (node as SVGGraphicsElement).transform?.baseVal.consolidate();
    if (own) m = matrix(own.matrix).multiply(m);
  }
  return m;
}

/** Reads an SVG's silhouette as loops of points. Colors are dropped: the morph draws every icon in one color. */
export function loadIcon(text: string): Icon {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.querySelector("svg");
  if (!root || doc.querySelector("parsererror")) throw new IconError("invalid");
  sanitize(root);

  // Measuring needs the SVG laid out in the page, so it is mounted out of sight for a moment.
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;width:200px;height:200px;opacity:0;pointer-events:none";
  const svg = document.importNode(root, true) as SVGSVGElement;
  svg.setAttribute("width", "200");
  svg.setAttribute("height", "200");
  host.appendChild(svg);
  document.body.appendChild(host);

  try {
    const inv = matrix(svg.getScreenCTM()!).inverse();
    const jobs: { el: SVGGeometryElement; mtx: DOMMatrix }[] = [];

    // Masked or clipped artwork (Gemini's blurred color blobs, say): the silhouette is the mask's shape, not the art.
    // A mask that is only one rectangle just crops to the canvas (Figma adds these), so it is ignored.
    const cropOnly = new Set<Element>();
    for (const hostEl of svg.querySelectorAll<SVGGraphicsElement>("[mask],[clip-path]")) {
      if (hostEl.parentElement?.closest("defs,mask,clipPath,[mask],[clip-path]")) continue;
      const id = urlId(hostEl.getAttribute("mask")) ?? urlId(hostEl.getAttribute("clip-path"));
      const ref = id ? svg.querySelector(`[id="${CSS.escape(id)}"]`) : null;
      const shapes = ref ? [...ref.querySelectorAll<SVGGeometryElement>(SHAPES)] : [];
      if (!shapes.length || (shapes.length === 1 && shapes[0].tagName === "rect")) { cropOnly.add(hostEl); continue; }
      const base = inv.multiply(matrix(hostEl.getScreenCTM()!));
      for (const el of shapes) jobs.push({ el, mtx: base.multiply(transformWithin(el, ref!)) });
    }
    for (const el of svg.querySelectorAll<SVGGeometryElement>(SHAPES)) {
      if (el.closest("defs,clipPath,mask,symbol,pattern,marker")) continue;
      const wrapper = el.closest("[mask],[clip-path]");
      if (wrapper && !cropOnly.has(wrapper)) continue; // drawn through its mask above
      const cs = getComputedStyle(el);
      if (cs.fill === "none" || cs.display === "none" || cs.visibility === "hidden") continue;
      jobs.push({ el, mtx: inv.multiply(matrix(el.getScreenCTM()!)) });
    }

    const raw: Float64Array[] = [];
    let rule: string | null = null;
    for (const { el, mtx } of jobs) {
      rule ??= getComputedStyle(el).fillRule;
      const targets: SVGGeometryElement[] = [];
      if (el.tagName === "path") {
        for (const d of splitSubpaths(el.getAttribute("d") ?? "")) {
          const p = document.createElementNS(NS, "path");
          p.setAttribute("d", d);
          el.parentNode!.appendChild(p);
          targets.push(p);
        }
      } else targets.push(el);
      for (const t of targets) {
        const len = t.getTotalLength();
        if (len > 1e-6) {
          const pts = new Float64Array(DENSE * 2);
          for (let i = 0; i < DENSE; i++) {
            const p = t.getPointAtLength((i / DENSE) * len);
            pts[2 * i] = mtx.a * p.x + mtx.c * p.y + mtx.e;
            pts[2 * i + 1] = mtx.b * p.x + mtx.d * p.y + mtx.f;
          }
          raw.push(pts);
        }
        if (t !== el) t.remove();
      }
    }
    if (!raw.length) throw new IconError("empty");

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of raw) for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
      y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
    }
    const s = BOX / Math.max(x1 - x0, y1 - y0);
    const ox = (BOX - (x1 - x0) * s) / 2 - x0 * s;
    const oy = (BOX - (y1 - y0) * s) / 2 - y0 * s;
    const loops = raw.map((p) => {
      for (let i = 0; i < p.length; i += 2) { p[i] = p[i] * s + ox; p[i + 1] = p[i + 1] * s + oy; } // in place: these arrays are ours
      return describe(p);
    });
    return { loops, rule: rule === "evenodd" ? "evenodd" : "nonzero" };
  } finally {
    host.remove();
  }
}

/** A loop's area (signed: the sign is its direction), length and center. */
export function describe(p: Float64Array): Loop {
  const n = p.length / 2;
  let area = 0, len = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
    area += xi * yj - xj * yi;
    len += Math.hypot(xj - xi, yj - yi);
    cx += xi; cy += yi;
  }
  return { pts: p, area: area / 2, len, cx: cx / n, cy: cy / n };
}

// ---------- pairing two icons ----------

/** A closed loop, resampled to exactly n points evenly spaced along its length. */
function resample(loop: Loop, n: number) {
  const p = loop.pts, m = p.length / 2;
  const out = new Float64Array(n * 2);
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    cum[i + 1] = cum[i] + Math.hypot(p[2 * j] - p[2 * i], p[2 * j + 1] - p[2 * i + 1]);
  }
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * cum[m];
    while (seg < m - 1 && cum[seg + 1] < d) seg++;
    const j = (seg + 1) % m;
    const t = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    out[2 * k] = p[2 * seg] + (p[2 * j] - p[2 * seg]) * t;
    out[2 * k + 1] = p[2 * seg + 1] + (p[2 * j + 1] - p[2 * seg + 1]) * t;
  }
  return out;
}

/** n copies of a loop's center: the invisible point a loop without a partner shrinks to or grows from. */
const centroidRing = (loop: Loop, n: number) => {
  const o = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) { o[2 * i] = loop.cx; o[2 * i + 1] = loop.cy; }
  return o;
};

function reverse(p: Float64Array) {
  const n = p.length / 2, o = new Float64Array(p.length);
  for (let i = 0; i < n; i++) { o[2 * i] = p[2 * (n - 1 - i)]; o[2 * i + 1] = p[2 * (n - 1 - i) + 1]; }
  return o;
}

/** Starts b at whichever point makes all points travel least, so the shape does not twist on the way. */
function align(a: Float64Array, b: Float64Array) {
  const n = a.length / 2;
  let best = 0, bestCost = Infinity;
  for (let s = 0; s < n; s++) {
    let c = 0;
    for (let i = 0; i < n && c < bestCost; i++) {
      const j = (i + s) % n, dx = a[2 * i] - b[2 * j], dy = a[2 * i + 1] - b[2 * j + 1];
      c += dx * dx + dy * dy;
    }
    if (c < bestCost) { bestCost = c; best = s; }
  }
  const o = new Float64Array(b.length);
  for (let i = 0; i < n; i++) { const j = (i + best) % n; o[2 * i] = b[2 * j]; o[2 * i + 1] = b[2 * j + 1]; }
  return o;
}

/** Matches every loop of A with the most similar loop of B. Loops left over shrink away or grow from a point. */
export function pairUp(A: Icon, B: Icon): Pair[] {
  const as = [...A.loops].sort((p, q) => Math.abs(q.area) - Math.abs(p.area));
  const left = [...B.loops];
  const matched: [Loop | null, Loop | null][] = [];
  for (const a of as) {
    if (!left.length) { matched.push([a, null]); continue; }
    let bi = 0, best = Infinity;
    left.forEach((b, i) => {
      const c = Math.hypot(a.cx - b.cx, a.cy - b.cy) + 1.5 * Math.abs(Math.sqrt(Math.abs(a.area)) - Math.sqrt(Math.abs(b.area)));
      if (c < best) { best = c; bi = i; }
    });
    matched.push([a, left.splice(bi, 1)[0]]);
  }
  for (const b of left) matched.push([null, b]);

  return matched.map(([a, b]) => {
    const n = Math.min(720, Math.max(48, Math.ceil(Math.max(a?.len ?? 0, b?.len ?? 0) * 1.4)));
    const pa = a ? resample(a, n) : centroidRing(b!, n);
    let pb = b ? resample(b, n) : centroidRing(a!, n);
    if (a && b) {
      if (Math.sign(a.area) !== Math.sign(b.area)) pb = reverse(pb);
      pb = align(pa, pb);
    }
    // Leftovers finish shrinking in the first half and newcomers grow in the second, so nothing is half there when
    // the fill rule flips from one icon's to the other's.
    const span: [number, number] = !a ? [0.45, 1] : !b ? [0, 0.5] : [0, 1];
    return { n, a: pa, b: pb, span };
  });
}

// ---------- drawing ----------

/** Where a pair's own clock is at overall progress t: leftovers and newcomers run on half the time (see `span`). */
const spanT = (span: [number, number], t: number) => Math.min(1, Math.max(0, (t - span[0]) / (span[1] - span[0])));

/** A pair's points at progress t (0 to 1). */
export function pointsAt({ n, a, b, span }: Pair, t: number) {
  const u = spanT(span, t);
  const out = new Float64Array(n * 2);
  for (let i = 0; i < 2 * n; i++) out[i] = a[i] + (b[i] - a[i]) * u;
  return out;
}

/** True when a pair has shrunk to its point (or not yet grown from it) at progress t. */
const collapsed = ({ span }: Pair, t: number) => (t >= span[1] && span[1] < 1) || (t <= span[0] && span[0] > 0);

/** One closed outline as path data. Points after the first are implicit linetos. */
function ring(pts: Float64Array) {
  let d = "";
  for (let i = 0; i < pts.length; i += 2) d += (i ? " " : "M") + pts[i].toFixed(2) + " " + pts[i + 1].toFixed(2);
  return d + "Z";
}

/** The morph at t (0 to 1) as a `d` string. */
export function pathAt(pairs: Pair[], t: number) {
  return pairs.filter((p) => !collapsed(p, t)).map((p) => ring(pointsAt(p, t))).join("");
}

/** The morph at t as an icon of its own, so a new morph can start from wherever this one is. */
export function iconAt(pairs: Pair[], t: number, rule: Icon["rule"]): Icon {
  const loops = pairs.filter((p) => !collapsed(p, t)).map((p) => describe(pointsAt(p, t)));
  return { loops: loops.filter((l) => l.len > 0.5), rule };
}

/** An icon, as drawn at rest. */
export function iconPath(icon: Icon) {
  return icon.loops.map((l) => ring(l.pts)).join("");
}

// ---------- easing ----------

type Curve = readonly [number, number, number, number];

/** One coordinate of a cubic bezier from (0,0) to (1,1), at parameter s. */
export const cubic = (c1: number, c2: number, s: number) => 3 * c1 * s * (1 - s) ** 2 + 3 * c2 * s * s * (1 - s) + s ** 3;

/** Solves a monotone coordinate for the parameter s that reaches `value`. */
export function solve(c1: number, c2: number, value: number) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (cubic(c1, c2, m) < value) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** A CSS-style cubic-bezier easing, as a function from time (0 to 1) to progress (0 to 1). */
export function easing([x1, y1, x2, y2]: Curve) {
  return (time: number) => cubic(y1, y2, solve(x1, x2, time));
}

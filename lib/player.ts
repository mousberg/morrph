import { easing, iconAt, iconPath, pairUp, pathAt, type Icon, type Pair } from "./morph";
import { DURATION, EASE, HOLD } from "./timing";

const ease = easing(EASE);

/**
 * Drives one <path>: morphs it between icons and loops through the list on its own.
 * It writes the path directly every frame, so React only re-renders when the target icon changes.
 * With reduced motion turned on, it never moves on its own; clicks still morph.
 */
export class MorphPlayer {
  private icons: Icon[] = [];
  private shown: Icon | null = null; // what is on screen while resting
  private pairs: Pair[] = [];
  private fromRule: Icon["rule"] = "nonzero";
  private progress = 0;
  private start = 0;
  private raf = 0;
  private idle: ReturnType<typeof setTimeout> | undefined;
  target = 0;

  constructor(private path: SVGPathElement, private onTarget: (i: number) => void) {}

  setIcons(icons: Icon[]) {
    this.icons = icons;
  }

  /** Shows icon i still, then carries on looping. */
  rest(i: number) {
    this.stop();
    this.target = i;
    this.shown = this.icons[i];
    this.path.setAttribute("d", iconPath(this.shown));
    this.path.setAttribute("fill-rule", this.shown.rule);
    this.onTarget(i);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (this.icons.length > 1 && !still) this.idle = setTimeout(() => this.go((i + 1) % this.icons.length), HOLD);
  }

  /** Morphs to icon i from whatever is on screen, even mid-morph, so a click turns smoothly instead of jumping. */
  go(i: number) {
    if (!this.icons[i]) return;
    if (!this.raf && !this.shown) return this.rest(i); // nothing on screen yet to morph from
    if (i === this.target) return; // already there, or already on the way
    const from = this.raf ? iconAt(this.pairs, this.progress, this.ruleAt(this.progress)) : this.shown!;
    this.stop();
    this.pairs = pairUp(from, this.icons[i]);
    this.fromRule = from.rule;
    this.target = i;
    this.progress = 0;
    this.start = performance.now();
    this.onTarget(i);
    this.raf = requestAnimationFrame(this.tick);
  }

  next() {
    this.go((this.target + 1) % this.icons.length);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.idle);
  }

  private ruleAt(t: number) {
    return t < 0.5 ? this.fromRule : this.icons[this.target].rule;
  }

  private tick = (now: number) => {
    const k = Math.min(1, (now - this.start) / DURATION);
    this.progress = ease(k);
    this.path.setAttribute("d", pathAt(this.pairs, this.progress));
    this.path.setAttribute("fill-rule", this.ruleAt(this.progress));
    if (k < 1) this.raf = requestAnimationFrame(this.tick);
    else this.rest(this.target);
  };
}

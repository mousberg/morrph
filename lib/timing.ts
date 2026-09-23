/** One place for the motion, so the page and every export move the same way. */

/** How long one morph takes, in milliseconds. */
export const DURATION = 900;

/** How long each icon rests before the loop moves on, in milliseconds. */
export const HOLD = 1100;

/**
 * The easing, as cubic-bezier control points (--ease-premium in globals.css). Fast out of the gate, soft landing.
 * Keep both y values between 0 and 1. The export cuts this curve into pieces and assumes it never overshoots.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;

# Morrph

A silly app so I can morph icons for my portfolio site, or something.

Drop in SVG icons and watch them morph into one another. Export the loop as one small animated SVG that plays anywhere, with no JavaScript.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/morph-dark.svg">
    <img src="docs/morph-light.svg" width="160" alt="The ChatGPT logo morphing into the Claude logo, then the Gemini logo, then back">
  </picture>
</p>

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| To | Do this |
| --- | --- |
| Go to the next icon | Click anywhere, or press → or Space |
| Go back | Press ← |
| Jump to an icon | Click its tile |
| Add icons | Drop SVG files anywhere on the page, or click **+** |
| Remove an icon | Hover its tile and click **×** (when there are more than two) |
| Get the animation | Click the download tile |

The page opens with the three icons in [`icons/`](icons). To change the starting loop, replace those files and update the list in [`app/page.tsx`](app/page.tsx).

## Put it on your site

The export tile gives you the loop exactly as the page plays it, in four forms.

| Export | What you get | Use it for |
| --- | --- | --- |
| **Download SVG** | `morrph.svg`, drawn in black | Any `<img>`: blog posts, CMS editors, Notion, Markdown, GitHub |
| **Copy SVG** | The same markup, drawn in `currentColor` | Pasting straight into HTML, so it takes the text color around it |
| **Download React** | `Morph.tsx`, no dependencies | React and Next.js projects |
| **Copy React** | The same component | Pasting into an existing file |

The three icons here export to about 40 KB. Servers gzip it to about 5 KB, which is smaller than most PNG icons.

**As an image.** Upload `morrph.svg` wherever images go, or reference it:

```html
<img src="/morrph.svg" width="120" height="120" alt="">
```

**Inline in HTML.** Paste the copied SVG and size it with CSS. It is drawn in `currentColor`, so `color` sets its color:

```html
<div style="width: 120px; color: #0b0b0c">
  <!-- paste the copied SVG here -->
</div>
```

**In React or Next.js.** Save `Morph.tsx` in your components folder:

```tsx
import { Morph } from "@/components/Morph";

export default function Post() {
  return <Morph width={120} height={120} className="text-neutral-900" />;
}
```

It accepts every `<svg>` prop. It is a plain component with no hooks, so it also works as a server component.

## How it works

Morphing two paths directly only works when both have the same structure: the same number of points, in the same order. Real icons almost never do. The ChatGPT logo is one outline with seven holes, and the Claude logo is a single outline. Morrph turns every icon into the same kind of thing first, then pairs the parts up.

1. **Read the silhouette.** Each SVG is cleaned of anything that could run code or load a file, laid out off screen in the browser, and every filled shape is traced with `getPointAtLength`. Paths are split into their separate outlines first, so holes become loops of their own. Transforms are applied. When artwork is drawn through a mask or clip path, the mask's shape is used as the silhouette. That is how Gemini's blurred color blobs become its four-point star.
2. **Fit the icons to one box.** Every icon is scaled and centered into the same 100 × 100 box, so any two line up.
3. **Pair the loops.** Each loop is matched with the loop in the other icon that is closest in position and size, biggest first.
4. **Collapse the leftovers.** A loop with no partner shrinks to an invisible point at its own center. Leftovers finish shrinking by the halfway mark, and new loops start growing just before it. The fill rule can flip from one icon's to the other's at halfway with nothing half visible.
5. **Stop the twisting.** Paired loops are resampled to the same number of evenly spaced points and turned to run the same direction. Each is rotated to start at whichever point makes the total travel smallest.
6. **Animate.** Every frame moves every point part of the way between its two positions, eased with `cubic-bezier(0.22, 1, 0.36, 1)`. A click mid-morph starts the next morph from the shape on screen, so it turns smoothly instead of jumping.

### How the export plays without JavaScript

The export uses SMIL, the animation built into SVG, which every current browser plays, including inside `<img>`.

- **One path per morph.** Each morph in the loop becomes its own `<path>`, and a discrete opacity animation shows one at a time.
- **The page's motion from a few keyframes.** Between the moments where loops start or stop collapsing, every point moves in a straight line. A keyframe at each of those moments, with the easing curve cut into matching pieces as `keySplines`, reproduces the page's motion.
- **Small files.** A point is dropped only if it sits within a fraction of a pixel of the outline in every keyframe, because all keyframes must keep the same points. Coordinates are written as short relative steps, rounded on absolute positions so rounding never adds up.

## Project layout

```
app/
  page.tsx          Reads the starting icons from icons/ and renders the app
  layout.tsx        Fonts and page metadata
  globals.css       Theme tokens and the few animations Tailwind can't express
components/
  Morpher.tsx       The page: the morphing icon, the tile row, dropping and keyboard
  ExportMenu.tsx    The export tile and its menu
  DropZone.tsx      The full-page overlay shown while dragging files
  ui.tsx            The shared tile style and the toast
lib/
  morph.ts          Reading SVGs into loops, pairing two icons, drawing any moment of a morph
  player.ts         Plays the loop on a <path> with requestAnimationFrame
  export.ts         Builds the self-playing SVG and the React component
  timing.ts         Duration, hold and easing, shared by the page and the export
icons/              The icons the page opens with
docs/               The animated preview at the top of this file, made with the app's own export
```

Timing lives in [`lib/timing.ts`](lib/timing.ts). Change it there and the page and every export follow.

## Limits

- **Filled shapes only.** Shapes with `fill="none"` are skipped, so icons drawn only with strokes produce nothing. Outline the strokes first, for example with Figma's Outline Stroke.
- **One color.** Morrph draws the silhouette, so an icon's own colors and gradients are dropped. A white shape drawn on top to cut a hole becomes solid.
- **Overlapping shapes.** All of an icon's shapes are drawn as one path with the first shape's fill rule. Separate shapes that overlap can cancel out where they cross. Merge them into one shape first if that happens.
- **Motion preferences.** With reduced motion turned on, the page stops looping on its own, and clicks still morph. The exported SVG always animates, because SMIL cannot read `prefers-reduced-motion`. If that matters on your site, show a still image to readers who have reduced motion turned on.

## Stack

Next.js 16, React 19, Tailwind CSS 4, TypeScript and Geist. The design is kept quiet on purpose: light mode, hairline borders, 5px corners, one easing curve and no text on the main screen.

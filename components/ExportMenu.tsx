"use client";

import { useEffect, useRef, useState } from "react";
import { TILE } from "@/components/ui";
import { buildAnimation, toReact, toSvg } from "@/lib/export";
import type { Icon } from "@/lib/morph";

const INK = "#0b0b0c";

type Action = { label: string; hint: string; run: (icons: Icon[]) => Promise<string> };

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ACTIONS: Action[] = [
  {
    label: "Download SVG",
    hint: "An image file. Works in any <img>.",
    run: async (icons) => { download("morrph.svg", toSvg(buildAnimation(icons), { fill: INK }), "image/svg+xml"); return "Saved morrph.svg"; },
  },
  {
    label: "Copy SVG",
    hint: "Paste into HTML. Takes the text color.",
    run: async (icons) => { await navigator.clipboard.writeText(toSvg(buildAnimation(icons))); return "SVG copied"; },
  },
  {
    label: "Download React",
    hint: "Morph.tsx, no dependencies.",
    run: async (icons) => { download("Morph.tsx", toReact(buildAnimation(icons)), "text/plain"); return "Saved Morph.tsx"; },
  },
  {
    label: "Copy React",
    hint: "The same component, to paste.",
    run: async (icons) => { await navigator.clipboard.writeText(toReact(buildAnimation(icons))); return "React component copied"; },
  },
];

/** The export tile and the small menu above it. Every export is the loop exactly as the page plays it. */
export function ExportMenu({ icons, say }: { icons: Icon[]; say: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Closes on a click anywhere else, or on Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", esc); };
  }, [open]);

  const run = async (action: Action) => {
    setOpen(false);
    try {
      say(await action.run(icons));
    } catch (err) {
      console.warn(err);
      say("That didn't work. Try again.");
    }
  };

  return (
    <div ref={root} className="relative">
      <button type="button" aria-label="Export" aria-haspopup="menu" aria-expanded={open} disabled={!icons.length} onClick={() => setOpen((o) => !o)}
              className={`${TILE} text-muted hover:text-text ${open ? "border-line-strong text-text" : "border-line"}`}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2.5v7.5M5 7l3 3 3-3M3 12.5v.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-.5" />
        </svg>
      </button>

      {/* Stays mounted so it can fade out; `inert` keeps the closed menu out of reach of the keyboard and screen readers. */}
      <div data-open={open} role="menu" inert={!open}
           className="export-panel absolute bottom-full right-0 mb-2.5 w-64 rounded-[5px] border border-line bg-panel p-1.5 shadow-[0_12px_32px_rgb(0_0_0/0.07)]">
        {ACTIONS.map((a) => (
          <button key={a.label} type="button" role="menuitem" onClick={() => run(a)}
                  className="block w-full rounded-[4px] px-3 py-2 text-left transition-colors hover:bg-black/[0.04] focus-visible:bg-black/[0.04] focus-visible:outline-none">
            <span className="block text-[13px] text-text">{a.label}</span>
            <span className="block text-[12px] text-muted">{a.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

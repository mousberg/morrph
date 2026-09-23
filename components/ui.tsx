"use client";

import { createPortal } from "react-dom";

/** The square tile every control in the bottom row is built on. Add a border color: `border-line` or `border-line-strong`. */
export const TILE =
  "grid size-12 place-items-center rounded-[5px] border bg-panel transition-all duration-300 ease-out hover:border-line-strong hover:bg-black/[0.03] active:scale-95 disabled:pointer-events-none disabled:opacity-40";

export type Note = { id: number; text: string };

/**
 * A short message, said once and then gone. It is portaled to <body>, because the tile row is transformed and a
 * transformed parent would pin a fixed element to itself instead of to the window. A new `id` replays the animation.
 */
export function Toast({ note }: { note: Note | null }) {
  if (!note) return null;
  return createPortal(
    <div key={note.id} role="status"
         className="toast pointer-events-none fixed bottom-28 left-1/2 z-50 whitespace-nowrap rounded-[5px] border border-line-strong bg-panel px-5 py-2 text-[13px] text-muted">
      {note.text}
    </div>,
    document.body,
  );
}

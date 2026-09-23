"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DropZone } from "@/components/DropZone";
import { ExportMenu } from "@/components/ExportMenu";
import { TILE, Toast, type Note } from "@/components/ui";
import { IconError, iconPath, loadIcon, type Icon } from "@/lib/morph";
import { MorphPlayer } from "@/lib/player";

type Entry = { id: number; icon: Icon; d: string };

let nextId = 0;
const toEntry = (icon: Icon): Entry => ({ id: nextId++, icon, d: iconPath(icon) });

const isSvgFile = (f: File) => /svg/i.test(f.type) || /\.svg$/i.test(f.name);
const reason = (err: unknown) => (err instanceof IconError ? err.message : "couldn't be read");

/**
 * One icon in the middle, morphing through the list on its own. Click anywhere (or press → / space) for the next one,
 * click a tile to jump to it, drop SVGs anywhere or use the plus tile to add them, and export the loop from the last tile.
 */
export function Morpher({ sources }: { sources: string[] }) {
  const pathRef = useRef<SVGPathElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const player = useRef<MorphPlayer | null>(null);
  const entriesRef = useRef<Entry[]>([]); // the latest list, for event handlers that outlive a render
  const [entries, setEntries] = useState<Entry[]>([]);
  const [target, setTarget] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const say = useCallback((text: string) => setNote({ id: Date.now(), text }), []);

  const commit = useCallback((list: Entry[]) => {
    entriesRef.current = list;
    setEntries(list);
    player.current?.setIcons(list.map((e) => e.icon));
  }, []);

  // Reading an SVG measures real paths, so the icons are loaded here in the browser rather than on the server.
  useEffect(() => {
    const p = new MorphPlayer(pathRef.current!, setTarget);
    player.current = p;
    const loaded: Entry[] = [];
    let failed = 0;
    for (const text of sources) {
      try { loaded.push(toEntry(loadIcon(text))); } catch (err) { failed++; console.warn("A starting icon couldn't be read.", err); }
    }
    if (failed) say(`${failed} starting ${failed === 1 ? "icon" : "icons"} couldn't be read`);
    commit(loaded);
    if (loaded.length) p.rest(0);
    return () => p.stop();
  }, [sources, commit, say]);

  const addFiles = useCallback(async (files: File[]) => {
    const added: Entry[] = [];
    const skipped: string[] = [];
    for (const f of files) {
      if (!isSvgFile(f)) { skipped.push(`${f.name} isn't an SVG`); continue; }
      try { added.push(toEntry(loadIcon(await f.text()))); } catch (err) { skipped.push(`${f.name} ${reason(err)}`); }
    }
    if (skipped.length) say(skipped.length === 1 ? skipped[0] : `${skipped.length} files were skipped`);
    if (!added.length) return;
    const at = entriesRef.current.length;
    commit([...entriesRef.current, ...added]);
    player.current?.go(at); // show the first new icon right away
  }, [commit, say]);

  const remove = (i: number) => {
    const list = entriesRef.current.filter((_, j) => j !== i);
    commit(list);
    const t = player.current!.target;
    player.current!.rest(Math.min(t > i ? t - 1 : t, list.length - 1));
  };

  // The whole window is the drop target. The counter keeps the frame up while a drag crosses child elements.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragging(true); };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles([...(e.dataTransfer?.files ?? [])]);
    };
    const key = (e: KeyboardEvent) => {
      const p = player.current, n = entriesRef.current.length;
      if (!p || !n || (e.target as Element).closest?.("button,input")) return; // buttons handle their own keys
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); p.next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); p.go((p.target - 1 + n) % n); }
    };
    const on = { dragenter: enter, dragleave: leave, dragover: over, drop, keydown: key } as const;
    for (const [type, fn] of Object.entries(on)) addEventListener(type, fn as EventListener);
    return () => { for (const [type, fn] of Object.entries(on)) removeEventListener(type, fn as EventListener); };
  }, [addFiles]);

  return (
    <>
      <main className="fixed inset-0 grid cursor-pointer select-none place-items-center" onClick={() => player.current?.next()}>
        <svg viewBox="0 0 100 100" className="size-[min(300px,56vw,52vh)] overflow-visible" role="img" aria-label="Morphing icon">
          <path ref={pathRef} className="fill-text" />
        </svg>
      </main>

      <div className="fixed bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2">
        {entries.map(({ id, icon, d }, i) => (
          <div key={id} className="rise group relative" style={{ "--i": i } as React.CSSProperties}>
            <button type="button" aria-label={`Morph to icon ${i + 1}`} aria-current={i === target} onClick={() => player.current?.go(i)}
                    className={`${TILE} ${i === target ? "border-line-strong" : "border-line"}`}>
              <svg viewBox="0 0 100 100" className={`size-5 transition-opacity duration-300 ${i === target ? "opacity-100" : "opacity-40 group-hover:opacity-100"}`}>
                <path className="fill-text" fillRule={icon.rule} d={d} />
              </svg>
            </button>
            {entries.length > 2 && (
              <button type="button" aria-label={`Remove icon ${i + 1}`} onClick={() => remove(i)}
                      className="absolute -right-1.5 -top-1.5 grid size-[18px] place-items-center rounded-full bg-text text-panel opacity-0 transition-opacity duration-200 focus-visible:opacity-100 group-hover:opacity-100">
                <svg width="8" height="8" viewBox="0 0 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" /></svg>
              </button>
            )}
          </div>
        ))}

        <div className="rise" style={{ "--i": entries.length } as React.CSSProperties}>
          <button type="button" aria-label="Add SVGs" onClick={() => fileRef.current?.click()} className={`${TILE} border-line text-muted hover:text-text`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
          </button>
        </div>

        <div className="rise ml-2 border-l border-line pl-4" style={{ "--i": entries.length + 1 } as React.CSSProperties}>
          <ExportMenu icons={entries.map((e) => e.icon)} say={say} />
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".svg,image/svg+xml" multiple hidden
             onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <DropZone dragging={dragging} />
      <Toast note={note} />
    </>
  );
}

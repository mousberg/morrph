const FADE = "300ms cubic-bezier(0.22, 1, 0.36, 1)";

/** Full-page drop target: dragging files over the window frames the page and shows one icon. No text. */
export function DropZone({ dragging }: { dragging: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-bg/80 backdrop-blur-md"
      style={{ opacity: dragging ? 1 : 0, transition: `opacity ${FADE}` }}
    >
      {/* An SVG frame rather than a CSS border: round dots, even spacing on every side, and the dots can drift. */}
      <svg className="absolute inset-6 h-[calc(100%-3rem)] w-[calc(100%-3rem)] overflow-visible">
        <rect x="3" y="3" rx="40" fill="none" stroke="rgb(0 0 0 / 0.35)" strokeWidth="6" strokeLinecap="round" strokeDasharray="0.1 20"
              className={dragging ? "drift" : undefined} style={{ width: "calc(100% - 6px)", height: "calc(100% - 6px)" }} />
      </svg>
      {/* A square becoming a circle: something is about to turn into something else. */}
      <svg width="148" height="148" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
           className="text-text" style={{ transform: dragging ? "none" : "scale(0.9)", transition: `transform ${FADE}` }}>
        <rect x="2.5" y="8.5" width="7" height="7" rx="1.5" />
        <circle cx="18" cy="12" r="3.75" />
        <path d="M10.75 12h2.5M12.25 10.75 13.5 12l-1.25 1.25" />
      </svg>
    </div>
  );
}

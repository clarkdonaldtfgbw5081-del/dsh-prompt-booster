/** Shared vector artwork for the toolbar and the release preview. */
export function OptimizeGlyph({ busy = false }: { busy?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {busy ? <>
      <circle className="pb-progress-track" cx="12" cy="12" r="8.25" />
      <circle className="pb-progress" cx="12" cy="12" r="8.25" strokeDasharray="18 34" />
      <rect x="9" y="9" width="6" height="6" rx="1.3" fill="currentColor" stroke="none" />
    </> : <>
      <path d="m10 5 2.2 6.8L19 14l-6.8 2.2L10 23l-2.2-6.8L1 14l6.8-2.2L10 5Z" transform="translate(1 -1) scale(.94)" />
      <path d="m19 2 1.1 3.4L23.5 6.5l-3.4 1.1L19 11l-1.1-3.4L14.5 6.5l3.4-1.1L19 2Z" />
    </>}
  </svg>
}

/*
  The catalog's drawn marks. One stroke weight (1.75), square caps and joins to
  match the ruled grammar — no unicode glyphs standing in for icons, and no
  multiplication sign pretending to be a tick.
*/

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
  viewBox: '0 0 16 16',
  'aria-hidden': 'true',
  focusable: 'false',
};

export const ArrowRight = ({ size = 14 }) => (
  <svg {...base} width={size} height={size}><path d="M2 8h11M9 4l4 4-4 4" /></svg>
);

export const Strike = ({ size = 13 }) => (
  <svg {...base} width={size} height={size}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
);

export const Tick = ({ size = 13 }) => (
  <svg {...base} width={size} height={size}><path d="M2.5 8.5l3.5 3.5L13.5 4" /></svg>
);

export const Plus = ({ size = 13 }) => (
  <svg {...base} width={size} height={size}><path d="M8 2.5v11M2.5 8h11" /></svg>
);

export const Download = ({ size = 14 }) => (
  <svg {...base} width={size} height={size}><path d="M8 2v8M4.5 7l3.5 3.5L11.5 7M2.5 13.5h11" /></svg>
);

export const ArrowLeft = ({ size = 14 }) => (
  <svg {...base} width={size} height={size}><path d="M14 8H3M7 4L3 8l4 4" /></svg>
);

/* Rename. Click-to-edit needs a mark of its own: a name you can change looks
   exactly like a name you cannot until something says so. */
export const Pencil = ({ size = 13 }) => (
  <svg {...base} width={size} height={size}><path d="M2.5 13.5h3l7-7-3-3-7 7z" /></svg>
);

/* The fold marker turns rather than swapping glyph, so open and closed read as
   one control in two positions. */
export const Chevron = ({ size = 13, open = false }) => (
  <svg
    {...base}
    width={size}
    height={size}
    style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease-out' }}
  >
    <path d="M5.5 2.5l6 5.5-6 5.5" />
  </svg>
);

/* ── the four tools, drawn as distinct silhouettes at a glance ───────── */

export const BoardIcon = ({ size = 22 }) => (
  <svg {...base} viewBox="0 0 24 24" width={size} height={size}>
    <path d="M3 12h18M6 8v8M11 8v8M16 8v8M20 8v8" />
  </svg>
);

export const SheetIcon = ({ size = 22 }) => (
  <svg {...base} viewBox="0 0 24 24" width={size} height={size}>
    <rect x="3" y="4" width="18" height="16" />
    <path d="M3 10h18M9 10v10M15 10v10" />
  </svg>
);

export const CubeIcon = ({ size = 22 }) => (
  <svg {...base} viewBox="0 0 24 24" width={size} height={size}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </svg>
);

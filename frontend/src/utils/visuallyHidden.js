/* For a file input behind a styled button. display: none (or `hidden`) stops
   iOS Safari from opening the picker, so the input stays rendered but is too
   small to see or tap; the label or button in front of it does the opening. */
export const VISUALLY_HIDDEN = Object.freeze({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
  opacity: 0,
});

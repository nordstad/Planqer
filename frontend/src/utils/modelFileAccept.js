export const MODEL_ACCEPT = '.stl,.step,.stp';

/* iOS turns each entry of `accept` into a file type it knows and greys out
   every file when one is unknown (it has no type for .step), so the picker
   opens but nothing can be chosen. There the filter is left off and the
   extension is checked after the choice. iPads can report themselves as Macs. */
export function modelFileAccept(nav = navigator) {
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent)
    || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return ios ? undefined : MODEL_ACCEPT;
}

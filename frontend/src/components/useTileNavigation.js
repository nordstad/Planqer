import { useEffect, useRef, useState } from 'react';

export default function useTileNavigation(candidate) {
  const listRef = useRef(null);
  const [activeCut, setActiveCut] = useState(null);
  useEffect(() => setActiveCut(null), [candidate]);
  const showInList = (label) => {
    setActiveCut(label);
    const row = Array.from(listRef.current?.querySelectorAll('[data-cut-label]') || [])
      .find((element) => element.dataset.cutLabel === label);
    row?.scrollIntoView({ block: 'center', behavior: 'auto' });
    row?.focus({ preventScroll: true });
  };
  return { listRef, activeCut, showInList };
}

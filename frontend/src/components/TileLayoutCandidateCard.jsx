/*
  One ranked candidate layout, shown as a small card: its own thumbnail (the
  server-rendered SVG, already captioned and colored), and the handful of
  numbers that make the tradeoff legible — tiles to buy, the tightest cut at
  an edge, slivers, and material used.

  Selection uses the system's own current-state grammar (a 2px amber
  underline) rather than an amber fill — see DESIGN.md's One Accent Rule. The
  card that starts selected is the solver's own recommended candidate, so the
  one amber signal on this step also carries "this is the one we'd pick."
*/

import { smallestCutMm } from '../utils/tileCutList';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const TileLayoutCandidateCard = ({ candidate, selected, onSelect }) => {
  const hasSliver = candidate.sliver_count > 0;
  const smallestCut = smallestCutMm(candidate);

  return (
    <button
      type="button"
      className="tile-candidate"
      data-selected={selected}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="tile-candidate-thumb">
        <img src={candidate.visualization} alt={`${candidate.label} layout diagram`} />
      </div>
      <div className="tile-candidate-body">
        <b className="tile-candidate-label">{candidate.label}</b>
        <dl className="tile-candidate-facts">
          <div>
            <dt>To buy</dt>
            <dd>{candidate.tiles_to_purchase_with_waste}</dd>
          </div>
          <div>
            <dt>Smallest cut</dt>
            <dd>{smallestCut === null ? 'None cut' : `${mm(smallestCut)} mm`}</dd>
          </div>
          <div>
            <dt>Used</dt>
            <dd>{(candidate.efficiency * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Distinct cuts</dt>
            <dd>{candidate.distinct_cut_sizes}</dd>
          </div>
        </dl>
        {hasSliver && (
          <p className="tile-candidate-warn">
            {candidate.sliver_count} sliver{candidate.sliver_count === 1 ? '' : 's'} below the guard
          </p>
        )}
      </div>
    </button>
  );
};

export default TileLayoutCandidateCard;

/*
  The cut list, as a component so it can render in two places from the same
  data shape: the live results page (TileResultDisplay, straight from
  /api/tile-layout) and the saved-project preview modal (UserDashboard,
  from a project's stored layout_result) — the API and the DB hold exactly
  the same JSON, so `candidate` here works whichever place it came from.
*/

import { buildCutList } from '../utils/tileCutList';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

// A small square in the exact color the diagram drew that size in — the
// diagram itself only labels tiles with text when there's room, but the
// color survives at any scale, so this is how a busy layout stays legible:
// same color in the list as on the tile.
const Swatch = ({ color }) => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-block', width: '13px', height: '13px', borderRadius: '3px',
      background: color, border: '1px solid var(--ink-4)', verticalAlign: 'middle', marginRight: '8px',
    }}
  />
);

const TileCutListTable = ({ candidate }) => {
  if (!candidate || !candidate.tiles || candidate.tiles.length === 0) return null;

  const { fullCount, fullColor, cutGroups } = buildCutList(candidate.tiles);
  if (fullCount === 0 && cutGroups.length === 0) return null;

  return (
    <section>
      <div className="section-rule">
        <h2 className="section-title">Cut list</h2>
        <span className="folio">Every size, colored to match the diagram</span>
      </div>
      <table className="cat-table" style={{ marginTop: '14px' }}>
        <thead>
          <tr><th>Size mm</th><th>Kind</th><th>From offcut</th><th>Qty</th></tr>
        </thead>
        <tbody>
          {fullCount > 0 && (
            <tr>
              <td style={{ textAlign: 'left', color: 'var(--ink)' }}>
                <Swatch color={fullColor} />Full tile
              </td>
              <td style={{ textAlign: 'left', color: 'var(--ink-2)' }}>No cut needed</td>
              <td>—</td>
              <td>{fullCount}</td>
            </tr>
          )}
          {cutGroups.map((group, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'left', color: 'var(--ink)' }}>
                <Swatch color={group.color} />{mm(group.width)} × {mm(group.height)}
                {group.sliverCount > 0 && (
                  <span style={{ color: 'var(--revision)', fontWeight: 700, marginLeft: '8px' }}>
                    {group.sliverCount === group.count ? 'sliver' : `${group.sliverCount} sliver`}
                  </span>
                )}
              </td>
              <td style={{ textAlign: 'left', color: 'var(--ink-2)' }}>
                {group.kind === 'notched' ? 'Cut around an opening — see diagram' : 'Straight cut'}
              </td>
              <td>{group.reusedCount > 0 ? `${group.reusedCount} of ${group.count}` : '—'}</td>
              <td>{group.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="synthetic" style={{ marginTop: '10px' }}>
        Sizes are the piece as it leaves the saw, in millimetres — no joint or perimeter gap added.
        The color of each row matches that size's tiles in the diagram above, so a busy layout stays
        readable without every tile needing its own printed dimensions.
        {candidate.notched_count > 0 && ' "Cut around an opening" gives the piece\u2019s outer size only; the notch itself is the shape drawn in the diagram.'}
        {candidate.reused_offcut_count > 0 && ' "From offcut" is how many of that size come free from another tile\u2019s leftover, not a fresh tile.'}
      </p>
    </section>
  );
};

export default TileCutListTable;

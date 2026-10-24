// A strip that wraps a corner keeps one colour on every wall it touches.
const LINK_COLOURS = ['#1f7a8c', '#7b4ea3', '#3b8a4b', '#2f5fb3', '#b0457a'];
export const linkColour = (stripNumber) => LINK_COLOURS[stripNumber % LINK_COLOURS.length];

const VIEW = { width: 720, height: 340, pad: 56 };
const wallLength = (wall) => Math.max(Number(wall.width_top) || 0, Number(wall.width_middle) || 0, Number(wall.width_bottom) || 0);

// Walls are entered clockwise with the room on the right of the direction of travel.
// An inside corner turns right; an outside corner turns left. Corners are assumed square.
// A "none" corner starts a new wall run: it is drawn below the previous walls, unconnected.
const LEGEND_THRESHOLD = 6;
const layOutWalls = (walls, corners) => {
  let point = [0, 0];
  let heading = [1, 0];
  let lowest = 0;
  const gap = Math.max(...walls.map(wallLength), 1) * 0.25;
  return walls.map((wall, index) => {
    const length = wallLength(wall);
    const start = point;
    const end = [start[0] + heading[0] * length, start[1] + heading[1] * length];
    const placed = { start, end, heading, inward: [-heading[1], heading[0]], length };
    const corner = corners[index];
    if (corner) heading = corner.kind === 'outside' ? [heading[1], -heading[0]] : [-heading[1], heading[0]];
    point = end;
    lowest = Math.max(lowest, start[1], end[1]);
    if (corner?.kind === 'none') {
      heading = [1, 0];
      point = [0, lowest + gap];
    }
    return placed;
  });
};

const RoomOverview = ({ walls, corners = [], plan, closed = false }) => {
  const placed = layOutWalls(walls, corners);
  const closure = plan?.closure;
  const useLegend = walls.length > LEGEND_THRESHOLD;
  const runCount = 1 + corners.filter((corner) => corner.kind === 'none').length;
  const xs = placed.flatMap((item) => [item.start[0], item.end[0]]);
  const ys = placed.flatMap((item) => [item.start[1], item.end[1]]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(1, Math.max(...xs) - minX);
  const spanY = Math.max(1, Math.max(...ys) - minY);
  const scale = Math.min((VIEW.width - VIEW.pad * 2) / spanX, (VIEW.height - VIEW.pad * 2) / spanY);
  const offsetX = (VIEW.width - spanX * scale) / 2;
  const offsetY = (VIEW.height - spanY * scale) / 2;
  const at = (item, along, inward = 0) => [
    offsetX + (item.start[0] - minX + item.heading[0] * along) * scale + item.inward[0] * inward,
    offsetY + (item.start[1] - minY + item.heading[1] * along) * scale + item.inward[1] * inward,
  ];
  const strips = plan?.strips || [];
  const segmentsFor = (wallIndex) => strips.flatMap((strip) => {
    const all = strip.segments?.length ? strip.segments : [strip];
    return all.filter((segment) => segment.wall_index === wallIndex).map((segment) => ({ ...segment, number: strip.number, linked: all.length > 1 }));
  });

  return <figure className="wallpaper-room-overview" aria-label="Room overview" style={{ margin: '0 0 32px' }}>
    <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label="Top-down overview of the walls, with seams and strips that wrap corners">
      {placed.map((item, index) => {
        const [x1, y1] = at(item, 0);
        const [x2, y2] = at(item, item.length);
        const sideways = item.inward[0];
        const [lx, ly] = at(item, item.length / 2, sideways ? 14 : 22);
        const anchor = sideways > 0 ? 'start' : sideways < 0 ? 'end' : 'middle';
        return <g key={index}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth="3" strokeLinecap="square" />
          {segmentsFor(index).map((segment) => {
            const [sx1, sy1] = at(item, segment.x_start, 6);
            const [sx2, sy2] = at(item, segment.x_end, 6);
            const [tx1, ty1] = at(item, segment.x_end, 0);
            const [tx2, ty2] = at(item, segment.x_end, 12);
            const colour = segment.linked ? linkColour(segment.number) : null;
            return <g key={`${segment.number}-${segment.x_start}`}>
              {colour && <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} stroke={colour} strokeWidth="6" strokeLinecap="butt" opacity="0.85" />}
              {segment.x_end < item.length - 1e-6 && <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={colour || 'var(--accent)'} strokeWidth="1.5" />}
            </g>;
          })}
          {useLegend
            ? <g><circle cx={lx} cy={ly} r="8" fill="var(--paper, #fff)" stroke="var(--ink)" /><text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="wallpaper-svg-small" style={{ fontWeight: 700 }}>{index + 1}</text></g>
            : <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="wallpaper-svg-small" style={{ fontWeight: 700 }}>{walls[index].name}</text>}
        </g>;
      })}
      {placed.slice(1).map((item, index) => { if (corners[index]?.kind === 'none') return null; const [cx, cy] = at(item, 0); return <circle key={index} cx={cx} cy={cy} r="3.5" fill="var(--ink)" />; })}
      {closed && closure && !closure.valid && (() => {
        const last = placed[placed.length - 1];
        const [gx1, gy1] = at(last, last.length);
        const [gx2, gy2] = at(placed[0], 0);
        return <line data-testid="closure-gap" x1={gx1} y1={gy1} x2={gx2} y2={gy2} stroke="#c0392b" strokeWidth="3" strokeDasharray="5 4" />;
      })()}
    </svg>
    {useLegend && <ol className="synthetic" aria-label="Wall numbers" style={{ columnCount: 2, margin: '8px 0', paddingLeft: '24px' }}>{walls.map((wall, index) => <li key={index}>{wall.name}</li>)}</ol>}
    <figcaption className="synthetic" style={{ textAlign: 'center' }}>{closed ? 'Closed room' : runCount > 1 ? `${runCount} separate wall runs` : 'Open wall run'}. Simplified top view: walls are shown in entry order with square corners.{closed ? ' A dashed red line marks where the walls fail to meet.' : ''} Coloured stretches are one strip that carries round a corner.</figcaption>
  </figure>;
};

export default RoomOverview;

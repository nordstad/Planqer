import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import RoomOverview from './RoomOverview';
import WallPicker from './WallPicker';
import WallpaperPieceGallery from './WallpaperPieceGallery';
import { WallElevation } from './WallpaperOptimizer';
import PlanSummary from './plan/PlanSummary';
import i18n from '../i18n';
import { formatMillimetres } from '../utils/measurements';
import { coveredStrips, needsDrawing, pieceFlags, pieceLabels, stripOf, stripLabel, toRanges, wallPieces } from '../utils/wallpaperPlan';

const mm = (value) => `${Math.round(value)} mm`;

export const summaryRows = (plan, wallpaper, t, savedAt, language = i18n.language) => {
  const rolls = plan.rolls_to_buy;
  const rows = [
    [t('wallpaperUi.summaryWallpaper'), [wallpaper.name, wallpaper.manufacturer].filter(Boolean).join(' · ')],
    [t('wallpaperUi.summaryRoll'), `${formatMillimetres(wallpaper.roll_width)} mm × ${formatMillimetres(wallpaper.roll_length)} mm${Number(wallpaper.repeat) > 0 ? ` · ${t('purchaseUi.repeat', { value: wallpaper.repeat })}${['straight', 'half_drop'].includes(wallpaper.match) ? ` · ${t(wallpaper.match === 'half_drop' ? 'wallpaperUi.matchHalfDrop' : 'wallpaperUi.matchStraight')}` : ''}` : ''}`],
    [t('wallpaperUi.summaryRolls'), t('wallpaperUi.summaryRollsValue', { toBuy: rolls, needed: plan.rolls_needed, spare: rolls - plan.rolls_needed })],
  ];
  if (Number(wallpaper.price_per_roll) > 0) rows.push([t('wallpaperUi.summaryCost'), `${(rolls * wallpaper.price_per_roll).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${wallpaper.currency || t('documentUi.currencyUnknown')}`]);
  rows.push([t('wallpaperUi.summaryStrips'), plan.strips?.length || 0], [t('wallpaperUi.summaryPieces'), plan.pieces?.length || 0]);
  if (savedAt) rows.push([t('wallpaperUi.summarySaved'), savedAt.slice(0, 10)]);
  return rows;
};

const WallpaperPlanDocument = ({ plan, walls, corners, closed, wallpaper, savedAt = null }) => {
  const { t, i18n } = useTranslation();
  const [wallIndex, setWallIndex] = useState(() => walls.findIndex((wall) => !wall.skip));
  const [openPieceId, setOpenPieceId] = useState(null);
  const labels = pieceLabels(plan, t);
  const wall = walls[wallIndex];
  const pieces = wallPieces(plan, wallIndex);
  const specialPieces = pieces.filter((piece) => needsDrawing(piece, stripOf(plan, piece)));
  const origin = wall.profile === 'sloped' ? t('wallpaperUi.originLocalLower') : t('wallpaperUi.originBottomLeft');
  const wallNames = walls.map((item) => item.name);

  return <div className="wallpaper-plan-document">
    <PlanSummary title={t('wallpaperUi.summaryTitle')} rows={summaryRows(plan, wallpaper, t, savedAt, i18n.language)} />
    {walls.filter((item) => !item.skip).length > 1 && <section className="plan-overview"><div><WallPicker walls={walls} value={wallIndex} onChange={setWallIndex} /><p className="synthetic">{t('wallpaperUi.overviewHint')}</p></div><RoomOverview walls={walls} corners={corners} plan={plan} closed={closed} activeWallIndex={wallIndex} onSelectWall={setWallIndex} /></section>}
    <section><div className="section-rule"><h2 className="section-title">{wall.name}</h2><span className="synthetic">{t('wallpaperUi.originLabel', { origin })}</span></div><div className="wallpaper-measured-sheet"><WallElevation wall={wall} wallIndex={wallIndex} plan={plan} wallNames={wallNames} labels={labels} /></div></section>
    <section><div className="section-rule"><h2 className="section-title">{t('wallpaperUi.stripTableTitle')}</h2></div><div className="document-table-scroll" role="region" tabIndex={0} aria-label={t('wallpaperUi.stripTableTitle')}><table className="strip-table"><thead><tr><th>{t('wallpaperUi.colStrip')}</th><th>{t('wallpaperUi.colWidth')}</th><th>{t('wallpaperUi.colCut')}</th><th>{t('wallpaperUi.colHang')}</th><th>{t('wallpaperUi.colNote')}</th><th aria-label={t('wallpaperUi.showDrawing')} /></tr></thead><tbody>{pieces.map((piece) => { const strip = stripOf(plan, piece); const flags = pieceFlags(piece, strip); const narrow = (strip.width || strip.x_end - strip.x_start) < wallpaper.roll_width - 0.5; const note = flags.length ? flags.map((flag) => t(`wallpaperUi.note${flag[0].toUpperCase()}${flag.slice(1)}`)).concat(narrow ? t('wallpaperUi.noteNarrow') : []).join(' · ') : narrow ? t('wallpaperUi.noteNarrow') : t('wallpaperUi.notePlain'); return <tr key={piece.id}><th>{labels.get(piece.id)}</th><td>{mm(strip.width || strip.x_end - strip.x_start)}{strip.return_overlap ? ` + ${mm(strip.return_overlap)}` : ''}</td><td>{mm(piece.cut_length ?? piece.length)}</td><td>{Math.round(piece.y_start)}–{Math.round(piece.y_end)}</td><td>{note}</td><td>{needsDrawing(piece, strip) && <button type="button" className="btn-text" onClick={() => setOpenPieceId(piece.id)}>{t('wallpaperUi.showDrawing')}</button>}</td></tr>; })}</tbody></table></div>{toRanges(coveredStrips(plan, wallIndex)).map(([from, to]) => <p className="synthetic" key={from}>{t('wallpaperUi.stripsCovered', { range: from === to ? stripLabel(t, from) : `${stripLabel(t, from)}–${stripLabel(t, to)}` })}</p>)}</section>
    <section><div className="section-rule"><h2 className="section-title">{t('wallpaperUi.specialDrawings')}</h2></div>{specialPieces.length ? <WallpaperPieceGallery pieces={specialPieces} strips={plan.strips} repeat={Number(wallpaper.repeat) || 0} wallNames={wallNames} labels={labels} legend={false} openId={openPieceId} onOpen={setOpenPieceId} /> : <p className="synthetic">{t('wallpaperUi.noSpecialPieces')}</p>}<p className="synthetic">{t('wallpaperUi.diagramLegend')}</p><p className="synthetic">{t('wallpaperUi.hatchLegend')}</p></section>
  </div>;
};

export default WallpaperPlanDocument;

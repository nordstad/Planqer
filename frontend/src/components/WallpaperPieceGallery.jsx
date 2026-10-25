import { useTranslation } from 'react-i18next';
import WallpaperPieceDiagram from './WallpaperPieceDiagram';

// A drawing of every piece on a wall; a piece opens full size in a sheet.
const WallpaperPieceGallery = ({ pieces, strips, repeat, wallNames, openId, onOpen }) => {
  const { t } = useTranslation();
  const stripOf = (piece) => strips.find((strip) => strip.number === piece.strip_number);
  const open = pieces.find((piece) => piece.id === openId);
  return <section aria-label={t('wallpaperUi.pieceDrawings')} style={{ marginBottom: '24px' }}>
    <div className="section-rule"><h2 className="section-title">{t('wallpaperUi.pieceDrawings')}</h2><span className="synthetic">{t('wallpaperUi.pieceDrawingsHint')}</span></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pieces.map((piece) => stripOf(piece) && <button type="button" key={piece.id} aria-label={t('wallpaperUi.openPiece', { id: piece.id })} data-testid="piece-drawing" className="text-left" style={{ border: '1px solid var(--rule-hair)', background: 'var(--card)' }} onClick={() => onOpen(piece.id)}>
        <WallpaperPieceDiagram piece={piece} strip={stripOf(piece)} repeat={repeat} wallNames={wallNames} />
      </button>)}
    </div>
    {open && stripOf(open) && <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={t('wallpaperUi.pieceAria', { id: open.id })} onClick={() => onOpen(null)}>
      <div className="cat-sheet" style={{ maxWidth: '760px', maxHeight: '90vh', overflow: 'auto' }} onClick={(event) => event.stopPropagation()}>
        <div className="masthead" style={{ marginTop: 0 }}>
          <span className="masthead-brand" style={{ fontSize: '13px' }}>{t('wallpaperUi.pieceStrip', { id: open.id, number: open.strip_number })}</span>
          <button type="button" className="masthead-flash" onClick={() => onOpen(null)}>{t('common.close')}</button>
        </div>
        <WallpaperPieceDiagram piece={open} strip={stripOf(open)} repeat={repeat} wallNames={wallNames} />
      </div>
    </div>}
  </section>;
};

export default WallpaperPieceGallery;

import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import TileResultDisplay from './TileResultDisplay';

it('keeps the needed/cut breakdown without restating candidate comparison metrics', () => {
  render(<TileResultDisplay candidate={{
    label: 'Most symmetric', visualization: 'data:image/png;base64,aW1hZ2U=',
    tiles: [], piece_diagrams: {}, warnings: [],
    full_tile_count: 8, cut_tile_count: 1, notched_count: 0, reused_offcut_count: 0,
    tiles_to_purchase: 9, tiles_to_purchase_with_waste: 10, sliver_count: 0,
    distinct_cut_sizes: 1, efficiency: 0.9, min_edge_cut_width: null, min_edge_cut_height: null,
  }} surfaceWidth={2400} surfaceHeight={1200} />);
  expect(screen.getByRole('cell', { name: i18n.t('ui.needed'), exact: true })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: i18n.t('ui.fullTiles'), exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: i18n.t('ui.distinctCutSizes'), exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: i18n.t('ui.materialUsed'), exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('cell', { name: i18n.t('legacy.withBreakage'), exact: true })).not.toBeInTheDocument();
});

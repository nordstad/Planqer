import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '../contexts/LanguageContext';
import ProjectShoppingList from './ProjectShoppingList';

const renderList = (projects) => render(
  <LanguageProvider>
    <ProjectShoppingList projects={projects} />
  </LanguageProvider>,
);

it('combines matching stock across plans', () => {
  renderList([
    {
      name: 'First cut',
      parts_data: { 100: 1 },
      optimization_result: { board_lengths_used: [300] },
      material_type: 'oak',
      board_thickness: 45,
      board_width: 45,
    },
    {
      name: 'Second cut',
      parts_data: { 100: 1 },
      optimization_result: { board_lengths_used: [300, 300] },
      material_type: 'oak',
      board_thickness: 45,
      board_width: 45,
    },
  ]);

  expect(screen.getByTestId('project-shopping-list')).toBeInTheDocument();
  expect(screen.getByText('Oak')).toBeInTheDocument();
  expect(screen.getByText('3', { selector: 'td' })).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(2);
});

it('renders nothing when plans have no purchasable material', () => {
  renderList([{ name: 'Empty plan' }]);

  expect(screen.getByTestId('project-shopping-list')).toBeInTheDocument();
  expect(screen.getByText('There is nothing to buy for this project yet.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('shows a project total when every material line is priced compatibly', () => {
  renderList([
    { name: 'Sheet', projectType: 'sheet', material_type: 'plywood', optimization_result: { sheets: [{ sheet_width: 1200, sheet_height: 2400 }] }, pricing: { price_per_unit: 500, currency: 'SEK', vat_rate: 25, prices_include_vat: true } },
    { name: 'Tile', projectType: 'tile', tile_data: { width: 300, height: 600 }, layout_result: { tiles_to_purchase: 2 }, pricing: { price_per_unit: 40, currency: 'SEK', vat_rate: 25, prices_include_vat: true } },
  ]);

  expect(screen.getByText(/Estimated project material cost: 1080.00 SEK including VAT \(25%\)/)).toBeInTheDocument();
});

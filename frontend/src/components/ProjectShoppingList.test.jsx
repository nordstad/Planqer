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
  expect(screen.getByRole('columnheader', { name: 'Quantity' })).toBeInTheDocument();
  expect(screen.getByText('4', { selector: '.shopping-buy strong' })).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(2);
});

it('separates tile thicknesses while combining identical tiles and retaining prices', () => {
  renderList([
    ['Thin A', 10, 27, 10],
    ['Thick', 20, 27, 20],
    ['Thin B', 10, 3, 10],
  ].map(([name, thickness, quantity, price]) => ({
    name, projectType: 'tile',
    tile_data: { material_type: 'Ceramic', width: 300, height: 600, thickness },
    layout_result: { tiles_to_purchase_with_waste: quantity },
    pricing: { price_per_unit: price, currency: 'SEK', prices_include_vat: true, vat_rate: 25 },
  })));
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('10 × 300 × 600');
  expect(rows[0].cells[2]).toHaveTextContent('30');
  expect(rows[0].cells[4]).toHaveTextContent('300.00 SEK');
  expect(rows[1]).toHaveTextContent('20 × 300 × 600');
  expect(rows[1].cells[2]).toHaveTextContent('27');
  expect(rows[1].cells[4]).toHaveTextContent('540.00 SEK');
  expect(screen.getByText(/Estimated project material cost: 840.00 SEK/)).toBeInTheDocument();
});

it('shows distinct wallpaper codes and makers with independently priced quantities', () => {
  renderList([
    ['Hall A', 'A001', 3, 200],
    ['Hall B', 'B002', 5, 300],
    ['Landing A', 'A001', 1, 200],
  ].map(([name, code, quantity, price]) => ({
    name, projectType: 'wallpaper',
    wallpaper_data: {
      name: 'Willow', manufacturer: 'Acme', product_code: code,
      roll_width: 530, roll_length: 10050, price_per_roll: price, currency: 'SEK',
    },
    plan_result: { rolls_to_buy: quantity },
  })));
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0].cells[0]).toHaveTextContent('Willow · Acme · A001');
  expect(rows[0].cells[2]).toHaveTextContent('4');
  expect(rows[0].cells[4]).toHaveTextContent('800.00 SEK');
  expect(rows[1].cells[0]).toHaveTextContent('Willow · Acme · B002');
  expect(rows[1].cells[2]).toHaveTextContent('5');
  expect(rows[1].cells[4]).toHaveTextContent('1500.00 SEK');
  expect(screen.getByText(/Estimated project material cost: 2300.00 SEK/)).toBeInTheDocument();
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

it('costs each row from the quantity to buy', () => {
  renderList([
    { name: 'Sheet', projectType: 'sheet', material_type: 'plywood', optimization_result: { sheets: [{ sheet_width: 1200, sheet_height: 2400 }] }, pricing: { price_per_unit: 500, currency: 'SEK', vat_rate: 25, prices_include_vat: true } },
  ]);

  expect(screen.getByText('1000.00 SEK', { selector: 'td' })).toBeInTheDocument();
});

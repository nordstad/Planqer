import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../contexts/LanguageContext';
import SheetOptimizer from './SheetOptimizer';
import i18n from '../i18n';
import {
  getCatalogue,
  getProjectGroups,
  getUserSheetProjects,
  getUserSettings,
  optimizeSheetCutting,
} from '../utils/api';
import { resetCatalogueCache } from '../utils/catalogue';

vi.mock('../utils/api', () => ({
  getCatalogue: vi.fn(),
  getProjectGroups: vi.fn(),
  getUserSheetProjects: vi.fn(),
  getUserSettings: vi.fn(),
  optimizeSheetCutting: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const catalogue = {
  country: 'SE',
  country_name: 'Sweden',
  types: [
    { key: 'plywood', kind: 'sheet', rank: 10, labels: { en: 'Plywood', sv: 'Plywood', nb: 'Kryssfiner' }, aliases: [], details: ['grade'] },
    { key: 'sheet-custom', kind: 'sheet', rank: 999, labels: { en: 'Other sheet' }, aliases: [], details: [] },
  ],
  details: { species: [], treatment: [], profile: [] },
  products: [{
    id: 'se:plywood:15', type: 'plywood', kind: 'sheet', country: 'SE', thickness: 15, width: null,
    lengths: [], max_length: null, formats: [{ width: 1200, height: 2400 }], species: [], treatments: [],
    grades: [], profiles: [], sources: ['https://www.metsagroup.com/'], note: null,
  }],
};

const renderSheetOptimizer = ({ loadExample = true, ...options } = {}) => {
  const result = render(
    <MemoryRouter {...options}>
      <LanguageProvider><SheetOptimizer /></LanguageProvider>
    </MemoryRouter>,
  );
  if (loadExample) fireEvent.click(screen.getByRole('button', { name: /example|exempel|eksempel/i }));
  return result;
};

beforeEach(() => {
  resetCatalogueCache();
  getCatalogue.mockRejectedValue(new Error('offline'));
  getProjectGroups.mockResolvedValue([]);
  getUserSheetProjects.mockResolvedValue([]);
  getUserSettings.mockResolvedValue({ default_currency: 'SEK', default_vat_rate: 25, default_prices_include_vat: true });
  optimizeSheetCutting.mockResolvedValue({
    total_sheets: 1,
    total_waste_area: 100,
    overall_efficiency: 50,
    algorithm_used: 'best_fit_2d',
    sheets: [],
  });
});

it('restores a saved sheet plan addressed by the edit query', async () => {
  getUserSheetProjects.mockResolvedValue([{
    id: 'sheet-1',
    name: 'Saved sheet',
    project_group_id: null,
    parts_data: [{ name: 'Shelf', width: 400, height: 200, quantity: 2 }],
    sheet_width: 1200,
    sheet_height: 2400,
    kerf_width: 3,
    material_type: 'plywood',
    allow_rotation: true,
    pricing: { price_per_unit: 650, currency: 'NOK', vat_rate: 15, prices_include_vat: false },
  }]);
  window.history.replaceState({}, '', '/sheet-cutting?edit=sheet-1');

  render(
    <MemoryRouter initialEntries={['/sheet-cutting?edit=sheet-1']}>
      <LanguageProvider><SheetOptimizer /></LanguageProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByDisplayValue('400')).toBeInTheDocument();
  expect(screen.getByDisplayValue('1200')).toBeInTheDocument();
  expect(screen.getByDisplayValue('2400')).toBeInTheDocument();
  expect(screen.getByDisplayValue('3')).toBeInTheDocument();
  expect(screen.getByLabelText('Price per sheet · NOK')).toHaveValue(650);
});

it('starts empty and loads named example parts on request', async () => {
  window.history.replaceState({}, '', '/sheet-cutting');
  renderSheetOptimizer({ loadExample: false, initialEntries: ['/sheet-cutting'] });

  expect(screen.queryByDisplayValue('800')).not.toBeInTheDocument();
  expect(screen.getByText(/Add the parts you need/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /example|exempel|eksempel/i }));

  expect(screen.getByDisplayValue('800')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Shelf back')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Shelf bottom')).toBeInTheDocument();
});

it('steps sheet and part dimensions in whole millimetres', () => {
  window.history.replaceState({}, '', '/sheet-cutting');
  renderSheetOptimizer();

  const dimensions = [
    ...screen.getAllByLabelText(/Part length in millimetres/i),
    screen.getByLabelText('Sheet width in millimetres'),
    ...screen.getAllByLabelText('Sheet height in millimetres'),
    document.getElementById('sheet-thickness'),
  ];

  dimensions.forEach((input) => expect(input).toHaveAttribute('step', '1'));
});

it('keeps a new part row clean until a field is touched and shows errors below the row', async () => {
  window.history.replaceState({}, '', '/sheet-cutting');
  renderSheetOptimizer({ loadExample: false, initialEntries: ['/sheet-cutting'] });

  fireEvent.click(screen.getByRole('button', { name: /Add part/i }));
  await new Promise((resolve) => setTimeout(resolve, 350));

  expect(screen.queryByText('Width must be a positive number')).not.toBeInTheDocument();
  expect(screen.queryByText('Height must be a positive number')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Part length in millimetres, item 1')).not.toHaveAttribute('placeholder');
  expect(screen.getAllByLabelText('Sheet height in millimetres')[0]).not.toHaveAttribute('placeholder');
  expect(screen.getByLabelText('Quantity, item 1')).not.toHaveAttribute('placeholder');
  expect(screen.getByLabelText('Name, item 1')).toHaveAttribute('placeholder', 'Optional');

  fireEvent.change(screen.getByLabelText('Quantity, item 1'), { target: { value: '0' } });
  const error = await screen.findByText('Qty must be a number');
  expect(error.closest('tr')).toHaveClass('sheet-part-error-row');
});

it('shows the sheet material cost using the configured VAT basis', async () => {
  window.history.replaceState({}, '', '/sheet-cutting');
  renderSheetOptimizer();

  fireEvent.change(document.getElementById('sheet-thickness'), { target: { value: '18' } });
  fireEvent.change(screen.getByLabelText('Price per sheet · SEK'), { target: { value: '250' } });
  const pack = screen.getByRole('button', { name: /plan the sheet cuts/i });
  await waitFor(() => expect(pack).not.toBeDisabled());
  fireEvent.click(pack);

  expect(await screen.findByText('250.00 SEK · including VAT (25%)')).toBeInTheDocument();
});

it('reruns restored rows without collapsing identical names', async () => {
  getUserSheetProjects.mockResolvedValue([{
    id: 'sheet-1',
    name: 'Saved sheet',
    project_group_id: null,
    parts_data: [
      { id: 'row-a', name: 'Shelf', width: 400, height: 200, quantity: 2 },
      { id: 'row-b', name: 'Shelf', width: 600, height: 300, quantity: 1 },
    ],
    sheet_width: 1200,
    sheet_height: 2400,
    sheet_thickness: 18,
    kerf_width: 3,
    material_type: 'plywood',
    allow_rotation: true,
  }]);
  window.history.replaceState({}, '', '/sheet-cutting?edit=sheet-1');

  render(
    <MemoryRouter initialEntries={['/sheet-cutting?edit=sheet-1']}>
      <LanguageProvider><SheetOptimizer /></LanguageProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByDisplayValue('400')).toBeInTheDocument();
  expect(screen.getAllByDisplayValue('Shelf')).toHaveLength(2);
  const packButton = screen.getByRole('button', { name: /plan the sheet cuts/i });
  await waitFor(() => expect(packButton).not.toBeDisabled());
  fireEvent.click(packButton);

  await waitFor(() => expect(optimizeSheetCutting).toHaveBeenCalledWith(
    [
      { id: 'row-a', name: 'Shelf', width: '400', height: '200', quantity: '2' },
      { id: 'row-b', name: 'Shelf', width: '600', height: '300', quantity: '1' },
    ],
    '1200',
    '2400',
    '3',
    'plywood',
    undefined,
    true,
  ));
});

it('explains why sheet planning is disabled when thickness is missing', async () => {
  window.history.replaceState({}, '', '/sheet-cutting');
  renderSheetOptimizer({ loadExample: false, initialEntries: ['/sheet-cutting'] });

  expect(screen.getByRole('button', { name: /plan the sheet cuts/i })).toBeDisabled();
  expect(screen.queryByText(/enter the sheet thickness before planning/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Add the parts you need/i)).toBeInTheDocument();
});

it.each([
  ['bottom_left_fill', 'ui.bottomLeft'],
  ['best_fit_2d', 'ui.bestFit'],
  ['genetic_2d', 'ui.genetic'],
  ['guillotine_cut', 'ui.guillotine'],
])('uses translated strategy and rotation text for %s', async (algorithm, labelKey) => {
  window.history.replaceState({}, '', '/sheet-cutting');
  const translate = vi.spyOn(i18n, 't');
  try {
    renderSheetOptimizer();
    expect(translate).toHaveBeenCalledWith('ui.fixLines', expect.any(Object));
    expect(translate).not.toHaveBeenCalledWith('ui.fixLines', expect.objectContaining({ kind: expect.anything() }));
    const strategy = screen.getByRole('button', { name: new RegExp(i18n.t('ui.packingStrategy')) });
    expect(strategy).toHaveTextContent(`${i18n.t('ui.allowRotation')}: ${i18n.t('ui.rotationAllowed')}`);
    fireEvent.click(strategy);
    fireEvent.change(screen.getByLabelText(i18n.t('ui.algorithm')), { target: { value: algorithm } });
    expect(strategy).toHaveTextContent(i18n.t(labelKey));
    expect(screen.getByText(i18n.t('ui.rotationDescription'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(strategy).toHaveTextContent(`${i18n.t('ui.allowRotation')}: ${i18n.t('ui.rotationOff')}`);
    optimizeSheetCutting.mockResolvedValue({
      total_sheets: 1,
      total_waste_area: 100,
      overall_efficiency: 50,
      algorithm_used: algorithm,
      sheets: [],
    });
    fireEvent.change(document.getElementById('sheet-thickness'), { target: { value: '18' } });
    const pack = screen.getByRole('button', { name: /plan the sheet cuts/i });
    await waitFor(() => expect(pack).not.toBeDisabled());
    fireEvent.click(pack);
    await screen.findByRole('heading', { name: i18n.t('workflow.yourSheetLayout') });
    expect(screen.getByText(i18n.t(labelKey))).toBeInTheDocument();
  } finally {
    translate.mockRestore();
  }
});

it('plans without any product chosen and sends no placeholder material', async () => {
  window.history.replaceState({}, '', '/sheet-cutting');
  renderSheetOptimizer();

  expect(screen.queryByText(/choose a sheet material/i)).not.toBeInTheDocument();
  fireEvent.change(document.getElementById('sheet-thickness'), { target: { value: '18' } });
  const pack = screen.getByRole('button', { name: /plan the sheet cuts/i });
  await waitFor(() => expect(pack).not.toBeDisabled());
  fireEvent.click(pack);

  await waitFor(() => expect(optimizeSheetCutting).toHaveBeenCalled());
  expect(optimizeSheetCutting.mock.calls[0][4]).toBe('');
});

it('fills in a product\'s thickness when it is picked and takes its standard sheet size when asked', async () => {
  getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
  window.history.replaceState({}, '', '/sheet-cutting');
  renderSheetOptimizer();

  const box = screen.getByRole('combobox', { name: 'Product' });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: 'plywood 15' } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: /^Plywood 15 mm/ }));
  expect(document.getElementById('sheet-thickness')).toHaveValue(15);
  fireEvent.click(screen.getByRole('button', { name: /1.200 × 2.400 mm/ }));

  expect(document.getElementById('sheet-thickness')).toHaveValue(15);
  expect(screen.getByDisplayValue('2400')).toBeInTheDocument();
  const pack = screen.getByRole('button', { name: /plan the sheet cuts/i });
  await waitFor(() => expect(pack).not.toBeDisabled());
  fireEvent.click(pack);

  await waitFor(() => expect(optimizeSheetCutting).toHaveBeenCalled());
  expect(optimizeSheetCutting.mock.calls[0].slice(1, 5)).toEqual(['1200', '2400', '3', 'Plywood 15 mm']);
});

it('restores the product a sheet plan was saved with', async () => {
  getUserSheetProjects.mockResolvedValue([{
    id: 'sheet-1',
    name: 'Saved sheet',
    project_group_id: null,
    parts_data: [{ name: 'Shelf', width: 400, height: 200, quantity: 2 }],
    sheet_width: 1200,
    sheet_height: 2400,
    sheet_thickness: 15,
    kerf_width: 3,
    material_type: 'Plywood 15 mm',
    allow_rotation: true,
    product: {
      type: 'plywood', name: 'Plywood 15 mm', catalogue_id: 'se:plywood:15', country: 'SE',
      labels: { en: 'Plywood', sv: 'Plywood' }, thickness: 15, width: null, lengths: [],
      formats: [{ width: 1200, height: 2400 }], sources: [], details: { grade: 'Birch' }, suggested: false,
    },
  }]);
  window.history.replaceState({}, '', '/sheet-cutting?edit=sheet-1');

  render(
    <MemoryRouter initialEntries={['/sheet-cutting?edit=sheet-1']}>
      <LanguageProvider><SheetOptimizer /></LanguageProvider>
    </MemoryRouter>,
  );

  await screen.findByDisplayValue('400');
  expect(screen.getByTestId('product-summary')).toHaveTextContent('Plywood 15 mm');
});

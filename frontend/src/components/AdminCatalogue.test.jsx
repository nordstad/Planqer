import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '../i18n';
import AdminCatalogue from './AdminCatalogue';
import * as api from '../utils/api';
import { resetCatalogueCache } from '../utils/catalogue';

vi.mock('../utils/api', () => ({
  getCatalogue: vi.fn(),
  getAdminCatalogue: vi.fn(),
  createCatalogueEntry: vi.fn(),
  updateCatalogueEntry: vi.fn(),
  hideCatalogueEntry: vi.fn(),
  restoreCatalogueEntry: vi.fn(),
  resetCatalogueEntry: vi.fn(),
  getCatalogueSuggestion: vi.fn(),
}));

const product = (id, type, thickness, width, extra = {}) => ({
  id, type, kind: 'board', country: 'SE', thickness, width, lengths: [2400, 3000], max_length: null,
  formats: [], species: [], treatments: [], grades: ['C24'], profiles: [], sources: ['https://www.traguiden.se/'], note: null, ...extra,
});
const vocabulary = {
  country: 'SE',
  country_name: 'Sweden',
  types: [
    { key: 'regel', kind: 'board', rank: 10, labels: { en: 'Framing timber', sv: 'Träreglar', nb: 'Reisverk' }, aliases: [], details: ['species', 'grade'] },
    { key: 'custom', kind: 'board', rank: 999, labels: { en: 'Other' }, aliases: [], details: [] },
    { key: 'plywood', kind: 'sheet', rank: 10, labels: { en: 'Plywood' }, aliases: [], details: [] },
  ],
  details: { species: [{ key: 'pine', labels: { en: 'Pine', sv: 'Furu', nb: 'Furu' } }], treatment: [], profile: [] },
  products: [],
};
const listing = () => [
  { product: product('se:regel:45x95', 'regel', 45, 95), origin: 'builtin', hidden: false },
  { product: product('se:regel:45x70', 'regel', 45, 70), origin: 'builtin', hidden: true },
  { product: product('local:regel:48x98', 'regel', 48, 98), origin: 'local', hidden: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  resetCatalogueCache();
  localStorage.clear();
  api.getCatalogue.mockResolvedValue({ data: vocabulary, etag: '"a"' });
  api.getAdminCatalogue.mockImplementation(async () => listing());
  [api.createCatalogueEntry, api.updateCatalogueEntry, api.hideCatalogueEntry, api.restoreCatalogueEntry, api.resetCatalogueEntry]
    .forEach((fn) => fn.mockResolvedValue({}));
});

const rowOf = (name) => screen.getByText(name).closest('tr');

describe('AdminCatalogue', () => {
  it('lists built-in, hidden and local products with their state', async () => {
    render(<AdminCatalogue />);
    expect(await screen.findByText('Framing timber 45 × 95 mm')).toBeInTheDocument();
    expect(within(rowOf('Framing timber 45 × 95 mm')).getByText('Built-in')).toBeInTheDocument();
    expect(within(rowOf('Framing timber 45 × 70 mm')).getByText('Hidden')).toBeInTheDocument();
    expect(within(rowOf('Framing timber 48 × 98 mm')).getByText('Local')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 products');
  });

  it('shows each product\'s origin as its own label', async () => {
    api.getAdminCatalogue.mockResolvedValue([
      ...listing(),
      { product: product('se:regel:45x120', 'regel', 45, 120), origin: 'modified', hidden: false },
      { product: product('local:regel:50x150', 'regel', 50, 150), origin: 'local', hidden: true },
    ]);
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    const label = (name, text) => within(rowOf(name)).getByText(text);
    expect(label('Framing timber 45 × 95 mm', 'Built-in')).toHaveClass('status-badge', 'status-badge-builtin');
    expect(label('Framing timber 48 × 98 mm', 'Local')).toHaveClass('status-badge', 'status-badge-local');
    expect(label('Framing timber 45 × 120 mm', 'Changed')).toHaveClass('status-badge', 'status-badge-modified');
    expect(label('Framing timber 45 × 70 mm', 'Hidden')).toHaveClass('status-badge', 'status-badge-hidden');
    // A hidden local product still says where it came from.
    expect(label('Framing timber 50 × 150 mm', 'Hidden')).toHaveClass('status-badge-hidden');
    expect(label('Framing timber 50 × 150 mm', 'Local')).toHaveClass('status-badge-local');
  });

  it('offers Suggest to Planqer only for local and modified products', async () => {
    api.getAdminCatalogue.mockResolvedValue([
      ...listing(),
      { product: product('se:regel:45x120', 'regel', 45, 120), origin: 'modified', hidden: false },
    ]);
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    const suggest = (name) => within(rowOf(name)).queryByRole('button', { name: 'Suggest to Planqer' });
    expect(suggest('Framing timber 45 × 95 mm')).not.toBeInTheDocument();
    expect(suggest('Framing timber 45 × 70 mm')).not.toBeInTheDocument();
    expect(suggest('Framing timber 48 × 98 mm')).toBeInTheDocument();
    expect(suggest('Framing timber 45 × 120 mm')).toBeInTheDocument();
  });

  it('searches and filters', async () => {
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: '48x98' } });
    expect(screen.queryByText('Framing timber 45 × 95 mm')).not.toBeInTheDocument();
    expect(screen.getByText('Framing timber 48 × 98 mm')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'hidden' } });
    expect(screen.getByText('Framing timber 45 × 70 mm')).toBeInTheDocument();
    expect(screen.queryByText('Framing timber 45 × 95 mm')).not.toBeInTheDocument();
  });

  it('hides and restores built-in entries', async () => {
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(within(rowOf('Framing timber 45 × 95 mm')).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(api.hideCatalogueEntry).toHaveBeenCalledWith('se:regel:45x95'));
    fireEvent.click(within(rowOf('Framing timber 45 × 70 mm')).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.restoreCatalogueEntry).toHaveBeenCalledWith('se:regel:45x70'));
  });

  it('adds a product with a size, lengths and a source', async () => {
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const form = screen.getByRole('form', { name: 'Add product' });
    const typeSelect = within(form).getByLabelText('Product type');
    expect(within(typeSelect).queryByText('Other')).not.toBeInTheDocument();
    fireEvent.change(typeSelect, { target: { value: 'regel' } });
    fireEvent.change(within(form).getByLabelText('Thickness (mm)'), { target: { value: '48' } });
    fireEvent.change(within(form).getByLabelText('Width (mm)'), { target: { value: '98' } });
    fireEvent.change(within(form).getByLabelText('Stock lengths (mm)'), { target: { value: '2400, 3000' } });
    fireEvent.change(within(form).getByLabelText(/Source URLs/), { target: { value: 'https://www.traguiden.se/x' } });
    fireEvent.click(within(form).getByLabelText('Pine'));
    fireEvent.click(within(form).getByRole('button', { name: 'Add to catalogue' }));
    await waitFor(() => expect(api.createCatalogueEntry).toHaveBeenCalledWith(expect.objectContaining({
      type: 'regel', thickness: 48, width: 98, lengths: [2400, 3000], species: ['pine'], sources: ['https://www.traguiden.se/x'],
    })));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Add product' })).not.toBeInTheDocument());
  });

  it('explains a missing type instead of sending', async () => {
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to catalogue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a product type.');
    expect(api.createCatalogueEntry).not.toHaveBeenCalled();
  });

  it('keeps the form open and shows the server message on rejection', async () => {
    api.createCatalogueEntry.mockRejectedValue(new Error('This product already exists; edit it instead'));
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const form = screen.getByRole('form', { name: 'Add product' });
    fireEvent.change(within(form).getByLabelText('Product type'), { target: { value: 'regel' } });
    fireEvent.change(within(form).getByLabelText('Thickness (mm)'), { target: { value: '45' } });
    fireEvent.change(within(form).getByLabelText('Width (mm)'), { target: { value: '95' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add to catalogue' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByRole('form', { name: 'Add product' })).toBeInTheDocument();
  });

  it('edits an entry without letting its size change', async () => {
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(within(rowOf('Framing timber 45 × 95 mm')).getByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit product' });
    expect(within(form).queryByLabelText('Thickness (mm)')).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Stock lengths (mm)'), { target: { value: '3000' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateCatalogueEntry).toHaveBeenCalledWith(
      'se:regel:45x95', expect.objectContaining({ lengths: [3000], grades: ['C24'] }),
    ));
  });

  it('confirms before deleting a local entry or reverting a built-in', async () => {
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    expect(within(rowOf('Framing timber 45 × 95 mm')).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    fireEvent.click(within(rowOf('Framing timber 48 × 98 mm')).getByRole('button', { name: 'Delete' }));
    expect(api.resetCatalogueEntry).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.resetCatalogueEntry).toHaveBeenCalledWith('local:regel:48x98'));
  });

  it('prepares a GitHub issue and only links to it', async () => {
    api.getCatalogueSuggestion.mockResolvedValue({
      snippet: 'country: SE\nproducts:\n- type: regel\n', url: 'https://github.com/nordstad/Planqer/issues/new?template=x',
    });
    const open = vi.spyOn(window, 'open');
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(within(rowOf('Framing timber 48 × 98 mm')).getByRole('button', { name: 'Suggest to Planqer' }));
    const form = screen.getByRole('form', { name: 'Suggest to Planqer' });
    expect(within(form).getByLabelText('Source URL')).toHaveValue('https://www.traguiden.se/');
    expect(within(form).getByLabelText('Country')).toHaveValue('SE');
    expect(within(form).queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Prepare issue' }));
    await waitFor(() => expect(api.getCatalogueSuggestion).toHaveBeenCalledWith('local:regel:48x98', { source: 'https://www.traguiden.se/', country: 'SE' }));
    const link = await within(form).findByRole('link', { name: 'Open on GitHub' });
    expect(link).toHaveAttribute('href', expect.stringContaining('github.com/nordstad/Planqer/issues/new'));
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(form).getByTestId('suggestion-snippet')).toHaveTextContent('type: regel');
    expect(open).not.toHaveBeenCalled();
  });

  it('shows why an issue could not be prepared', async () => {
    api.getCatalogueSuggestion.mockRejectedValue(new Error('a source URL is needed to suggest a product'));
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(within(rowOf('Framing timber 48 × 98 mm')).getByRole('button', { name: 'Suggest to Planqer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare issue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('source URL is needed');
  });

  it('shows a load error', async () => {
    api.getAdminCatalogue.mockRejectedValue(new Error('Admin access required'));
    render(<AdminCatalogue />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Admin access required');
  });
});

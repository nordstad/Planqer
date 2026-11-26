import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '../i18n';
import AdminCatalogue from './AdminCatalogue';
import * as api from '../utils/api';
import { resetCatalogueCache } from '../utils/catalogue';
import { setCatalogueChoice } from '../utils/catalogueChoice';

vi.mock('../utils/api', () => ({
  getCatalogue: vi.fn(),
  getAdminCatalogue: vi.fn(),
  createCatalogueEntry: vi.fn(),
  updateCatalogueEntry: vi.fn(),
  hideCatalogueEntry: vi.fn(),
  restoreCatalogueEntry: vi.fn(),
  resetCatalogueEntry: vi.fn(),
  getCatalogueSuggestion: vi.fn(),
  getAuthToken: vi.fn(),
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
  api.getCatalogueSuggestion.mockResolvedValue({ snippet: '', url: 'https://github.com/nordstad/partsible/issues/new' });
  api.getAuthToken.mockReturnValue(null);
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const countryListing = (country) => listing().map((item) => ({
  ...item, product: { ...item.product, country, id: item.product.id.replace(/^se:/, `${country.toLowerCase()}:`) },
}));
const countryVocabulary = (country) => ({
  ...vocabulary, country, country_name: country === 'SE' ? 'Sweden' : 'Norway',
  types: vocabulary.types.map((type) => ({
    ...type, labels: { en: `${country} ${type.labels.en}` },
  })),
});
const countrySetup = () => {
  const lists = [];
  const vocabularies = [];
  localStorage.setItem('partsible-catalogue-country-v1', 'SE');
  api.getAdminCatalogue.mockImplementation((country) => {
    const request = { ...deferred(), country };
    lists.push(request);
    return request.promise;
  });
  api.getCatalogue.mockImplementation((etag, country) => {
    const request = { ...deferred(), country };
    vocabularies.push(request);
    return request.promise;
  });
  const view = render(<AdminCatalogue />);
  const release = async (index, country, modified = false) => {
    await act(async () => {
      const items = countryListing(country);
      if (modified) items[2].origin = 'modified';
      lists[index].resolve(items);
      vocabularies[index].resolve({ data: countryVocabulary(country), etag: `"${country}"` });
    });
  };
  return { ...view, lists, vocabularies, release };
};
const changeCountry = (country) => fireEvent.change(
  screen.getByLabelText('Catalogue'), { target: { value: country } },
);
const expectCountryPending = () => {
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add product' })).not.toBeInTheDocument();
};

describe('AdminCatalogue country identity', () => {
  for (const first of ['list', 'vocabulary']) {
    it(`does not expose rows or mutations when only ${first} has loaded`, async () => {
      const state = countrySetup();
      await act(async () => {
        if (first === 'list') state.lists[0].resolve(countryListing('SE'));
        else state.vocabularies[0].resolve({ data: countryVocabulary('SE'), etag: '"SE"' });
      });
      expectCountryPending();
      await state.release(0, 'SE');
      expect(screen.getByText('SE Framing timber 48 × 98 mm')).toBeInTheDocument();
    });
  }

  for (const panel of ['add', 'edit', 'suggest', 'delete']) {
    it(`retires the old rows and ${panel} panel immediately on country change`, async () => {
      const state = countrySetup();
      await state.release(0, 'SE');
      if (panel === 'add') fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
      else {
        const names = { edit: 'Edit', suggest: 'Suggest to Partsible', delete: 'Delete' };
        fireEvent.click(within(rowOf('SE Framing timber 48 × 98 mm')).getByRole('button', { name: names[panel] }));
      }
      changeCountry('NO');
      expectCountryPending();
      expect(screen.getByLabelText('Catalogue')).toHaveValue('NO');
      await state.release(1, 'NO');
      expect(screen.getByText('NO Framing timber 48 × 98 mm')).toBeInTheDocument();
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  }

  for (const order of ['old-first', 'new-first']) {
    for (const endpoint of ['list', 'vocabulary']) {
      for (const failure of [false, true]) {
        it(`ignores obsolete ${endpoint} ${failure ? 'failure' : 'success'} (${order})`, async () => {
          const state = countrySetup();
          // Change through the shared choice store while the first load is pending.
          act(() => setCatalogueChoice('NO'));
          const obsolete = async () => act(async () => {
            const target = endpoint === 'list' ? state.lists[0] : state.vocabularies[0];
            const other = endpoint === 'list' ? state.vocabularies[0] : state.lists[0];
            other.resolve(endpoint === 'list'
              ? { data: countryVocabulary('SE'), etag: '"SE"' } : countryListing('SE'));
            if (failure) target.reject(new Error('Obsolete country failed'));
            else target.resolve(endpoint === 'list'
              ? countryListing('SE') : { data: countryVocabulary('SE'), etag: '"SE"' });
          });
          if (order === 'old-first') {
            await obsolete();
            expectCountryPending();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            await state.release(1, 'NO');
          } else {
            await state.release(1, 'NO');
            await obsolete();
          }
          expect(screen.getByText('NO Framing timber 48 × 98 mm')).toBeInTheDocument();
          expect(screen.queryByText('SE Framing timber 48 × 98 mm')).not.toBeInTheDocument();
          expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
      }
    }
  }

  it('keeps Sweden current after SE→NO→SE and a late Norway response', async () => {
    const state = countrySetup();
    await state.release(0, 'SE');
    changeCountry('NO');
    changeCountry('SE');
    expectCountryPending();
    await state.release(2, 'SE');
    await state.release(1, 'NO');
    expect(screen.getByText('SE Framing timber 48 × 98 mm')).toBeInTheDocument();
    expect(screen.queryByText('NO Framing timber 48 × 98 mm')).not.toBeInTheDocument();
    expect(state.lists.map(({ country }) => country)).toEqual(['SE', 'NO', 'SE']);
    expect(state.vocabularies.map(({ country }) => country)).toEqual(['SE', 'NO', 'SE']);
  });

  it('does not revive an earlier Sweden request when returning to Sweden', async () => {
    const state = countrySetup();
    changeCountry('NO');
    changeCountry('SE');
    await state.release(0, 'SE');
    expectCountryPending();
    await state.release(2, 'SE');
    await state.release(1, 'NO');
    expect(screen.getByText('SE Framing timber 48 × 98 mm')).toBeInTheDocument();
  });

  it('passes explicit generic and automatic-default request contexts', async () => {
    const state = countrySetup();
    await state.release(0, 'SE');
    changeCountry('generic');
    expectCountryPending();
    expect(state.lists[1].country).toBe('generic');
    expect(state.vocabularies[1].country).toBe('generic');
    changeCountry('auto');
    expectCountryPending();
    expect(state.lists[2].country).toBe(null);
    expect(state.vocabularies[2].country).toBe(undefined);
    await state.release(2, 'SE');
    await state.release(1, 'NO');
    expect(screen.getByLabelText('Catalogue')).toHaveValue('auto');
    expect(screen.getByText('SE Framing timber 48 × 98 mm')).toBeInTheDocument();
  });

  it('recovers from a current-country failure by switching country', async () => {
    const state = countrySetup();
    await act(async () => state.lists[0].reject(new Error('Current load failed')));
    expect(screen.getByRole('alert')).toHaveTextContent('Current load failed');
    expect(screen.queryByRole('button', { name: 'Add product' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    changeCountry('NO');
    expectCountryPending();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await state.release(1, 'NO');
    expect(screen.getByText('NO Framing timber 48 × 98 mm')).toBeInTheDocument();
  });

  it('preserves search and filter while retiring country-specific data', async () => {
    const state = countrySetup();
    await state.release(0, 'SE');
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: '48x98' } });
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'local' } });
    changeCountry('NO');
    await state.release(1, 'NO');
    expect(screen.getByLabelText('Search products')).toHaveValue('48x98');
    expect(screen.getByLabelText('Show')).toHaveValue('local');
    expect(screen.getByText('NO Framing timber 48 × 98 mm')).toBeInTheDocument();
  });

  for (const operation of ['add', 'edit', 'hide', 'restore', 'delete', 'revert']) {
    it(`pins ${operation} to the displayed country`, async () => {
      const state = countrySetup();
      await state.release(0, 'SE', operation === 'revert');
      if (operation === 'add') {
        fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
        const form = screen.getByRole('form', { name: 'Add product' });
        fireEvent.change(within(form).getByLabelText('Product type'), { target: { value: 'regel' } });
        fireEvent.change(within(form).getByLabelText('Thickness (mm)'), { target: { value: '48' } });
        fireEvent.change(within(form).getByLabelText('Width (mm)'), { target: { value: '98' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Add to catalogue' }));
        expect(api.createCatalogueEntry).toHaveBeenCalledWith(expect.any(Object), 'SE');
      } else if (operation === 'edit') {
        fireEvent.click(within(rowOf('SE Framing timber 48 × 98 mm')).getByRole('button', { name: 'Edit' }));
        fireEvent.click(within(screen.getByRole('form', { name: 'Edit product' })).getByRole('button', { name: 'Save' }));
        expect(api.updateCatalogueEntry).toHaveBeenCalledWith('local:regel:48x98', expect.any(Object), 'SE');
      } else if (operation === 'hide' || operation === 'restore') {
        const restore = operation === 'restore';
        fireEvent.click(within(rowOf(`SE Framing timber 45 × ${restore ? 70 : 95} mm`)).getByRole('button', { name: restore ? 'Restore' : 'Hide' }));
        expect(restore ? api.restoreCatalogueEntry : api.hideCatalogueEntry)
          .toHaveBeenCalledWith(`se:regel:45x${restore ? 70 : 95}`, 'SE');
      } else {
        const label = operation === 'revert' ? 'Revert' : 'Delete';
        fireEvent.click(within(rowOf('SE Framing timber 48 × 98 mm')).getByRole('button', { name: label }));
        fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: label }));
        expect(api.resetCatalogueEntry).toHaveBeenCalledWith('local:regel:48x98', 'SE');
      }
      await waitFor(() => expect(state.lists).toHaveLength(2));
      await state.release(1, 'SE');
    });
  }

  for (const failure of [false, true]) {
    it(`ignores an old mutation's late ${failure ? 'failure' : 'success'} while a new-country mutation is pending`, async () => {
      const oldMutation = deferred();
      const newMutation = deferred();
      api.hideCatalogueEntry.mockReturnValueOnce(oldMutation.promise).mockReturnValueOnce(newMutation.promise);
      const state = countrySetup();
      await state.release(0, 'SE');
      fireEvent.click(within(rowOf('SE Framing timber 45 × 95 mm')).getByRole('button', { name: 'Hide' }));
      changeCountry('NO');
      await state.release(1, 'NO');
      fireEvent.click(within(rowOf('NO Framing timber 45 × 95 mm')).getByRole('button', { name: 'Hide' }));
      await act(async () => {
        if (failure) oldMutation.reject(new Error('Obsolete mutation failed'));
        else oldMutation.resolve({});
      });
      expect(state.lists).toHaveLength(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(within(rowOf('NO Framing timber 45 × 95 mm')).getByRole('button', { name: 'Hide' })).toBeDisabled();
      await act(async () => newMutation.resolve({}));
      expect(state.lists).toHaveLength(3);
      await state.release(2, 'NO');
      expect(within(rowOf('NO Framing timber 45 × 95 mm')).getByRole('button', { name: 'Hide' })).toBeEnabled();
    });
  }

  it('retains a current failed edit and supports retry against the same country', async () => {
    const state = countrySetup();
    api.updateCatalogueEntry.mockRejectedValueOnce(new Error('Current save failed'));
    await state.release(0, 'SE');
    fireEvent.click(within(rowOf('SE Framing timber 48 × 98 mm')).getByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit product' });
    fireEvent.change(within(form).getByLabelText('Stock lengths (mm)'), { target: { value: '3600' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Current save failed');
    expect(within(form).getByLabelText('Stock lengths (mm)')).toHaveValue('3600');
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.lists).toHaveLength(2));
    await state.release(1, 'SE');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(api.updateCatalogueEntry).toHaveBeenLastCalledWith(
      'local:regel:48x98', expect.objectContaining({ lengths: [3600] }), 'SE',
    );
  });
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

  it('offers Suggest to Partsible only for local and modified products', async () => {
    api.getAdminCatalogue.mockResolvedValue([
      ...listing(),
      { product: product('se:regel:45x120', 'regel', 45, 120), origin: 'modified', hidden: false },
    ]);
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    const suggest = (name) => within(rowOf(name)).queryByRole('button', { name: 'Suggest to Partsible' });
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
    await waitFor(() => expect(api.hideCatalogueEntry).toHaveBeenCalledWith('se:regel:45x95', null));
    fireEvent.click(within(rowOf('Framing timber 45 × 70 mm')).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.restoreCatalogueEntry).toHaveBeenCalledWith('se:regel:45x70', null));
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
    }), null));
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
      'se:regel:45x95', expect.objectContaining({ lengths: [3000], grades: ['C24'] }), null,
    ));
  });

  it('confirms before deleting a local entry or reverting a built-in', async () => {
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    expect(within(rowOf('Framing timber 45 × 95 mm')).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    fireEvent.click(within(rowOf('Framing timber 48 × 98 mm')).getByRole('button', { name: 'Delete' }));
    expect(api.resetCatalogueEntry).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.resetCatalogueEntry).toHaveBeenCalledWith('local:regel:48x98', null));
  });

  it('opens the edit and suggest forms directly under the row they belong to', async () => {
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(within(rowOf('Framing timber 48 × 98 mm')).getByRole('button', { name: 'Suggest to Partsible' }));
    const suggest = screen.getByRole('form', { name: 'Suggest to Partsible' });
    expect(rowOf('Framing timber 48 × 98 mm').nextElementSibling).toContainElement(suggest);

    fireEvent.click(within(rowOf('Framing timber 45 × 70 mm')).getByRole('button', { name: 'Edit' }));
    const edit = screen.getByRole('form', { name: 'Edit product' });
    expect(rowOf('Framing timber 45 × 70 mm').nextElementSibling).toContainElement(edit);
    expect(screen.queryByRole('form', { name: 'Suggest to Partsible' })).not.toBeInTheDocument();
  });

  it('pre-fills the source the built-in products of the same type cite', async () => {
    api.getAdminCatalogue.mockResolvedValue([
      ...listing(),
      { product: product('se:regel:45x120', 'regel', 45, 120, { sources: ['https://www.svenskttra.se/lathunden', 'https://www.traguiden.se/'] }), origin: 'builtin', hidden: false },
      { product: product('local:regel:50x150', 'regel', 50, 150, { sources: [] }), origin: 'local', hidden: false },
    ]);
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 50 × 150 mm');
    fireEvent.click(within(rowOf('Framing timber 50 × 150 mm')).getByRole('button', { name: 'Suggest to Partsible' }));
    const form = screen.getByRole('form', { name: 'Suggest to Partsible' });

    expect(within(form).getByLabelText('Source URL')).toHaveValue('https://www.traguiden.se/');
    expect(within(form).getByText('Taken from the built-in Framing timber products.')).toBeInTheDocument();
    await waitFor(() => expect(api.getCatalogueSuggestion).toHaveBeenCalledWith('local:regel:50x150', { source: 'https://www.traguiden.se/', country: 'SE' }));
    fireEvent.change(within(form).getByLabelText('Source URL'), { target: { value: 'https://example.com/regel' } });
    expect(within(form).queryByText(/taken from the built-in/i)).not.toBeInTheDocument();
  });

  it('drops the borrowed source for another country, but keeps one the admin typed', async () => {
    api.getAdminCatalogue.mockResolvedValue([
      ...listing(),
      { product: product('local:regel:50x150', 'regel', 50, 150, { sources: [] }), origin: 'local', hidden: false },
    ]);
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 50 × 150 mm');
    fireEvent.click(within(rowOf('Framing timber 50 × 150 mm')).getByRole('button', { name: 'Suggest to Partsible' }));
    const form = screen.getByRole('form', { name: 'Suggest to Partsible' });
    const source = within(form).getByLabelText('Source URL');
    const country = within(form).getByLabelText('Country');

    fireEvent.change(country, { target: { value: 'no' } });
    expect(country).toHaveValue('NO');
    expect(source).toHaveValue('');
    expect(within(form).getByText(/add an https:\/\/ link/i)).toBeInTheDocument();
    fireEvent.change(country, { target: { value: 'SE' } });
    expect(source).toHaveValue('https://www.traguiden.se/');

    fireEvent.change(source, { target: { value: 'https://www.moelven.com/no/regel' } });
    fireEvent.change(country, { target: { value: 'NO' } });
    expect(source).toHaveValue('https://www.moelven.com/no/regel');
  });

  it('prepares the issue only once there is an https source', async () => {
    api.getAdminCatalogue.mockResolvedValue([
      { product: product('local:regel:50x150', 'regel', 50, 150, { sources: [] }), origin: 'local', hidden: false },
    ]);
    api.getCatalogueSuggestion.mockResolvedValue({ snippet: 'type: regel', url: 'https://github.com/nordstad/partsible/issues/new?x' });
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 50 × 150 mm');
    fireEvent.click(within(rowOf('Framing timber 50 × 150 mm')).getByRole('button', { name: 'Suggest to Partsible' }));
    const form = screen.getByRole('form', { name: 'Suggest to Partsible' });
    const source = within(form).getByLabelText('Source URL');

    expect(within(form).queryByRole('button', { name: 'Prepare issue' })).not.toBeInTheDocument();
    expect(within(form).getByText(/add an https:\/\/ link/i)).toBeInTheDocument();
    fireEvent.change(source, { target: { value: 'http://example.com/trall' } });
    await new Promise((resolve) => { setTimeout(resolve, 600); });
    expect(api.getCatalogueSuggestion).not.toHaveBeenCalled();
    expect(within(form).queryByRole('link', { name: 'Open on GitHub' })).not.toBeInTheDocument();

    fireEvent.change(source, { target: { value: 'https://example.com/trall' } });
    expect(within(form).queryByText(/add an https:\/\/ link/i)).not.toBeInTheDocument();
    expect(await within(form).findByRole('link', { name: 'Open on GitHub' })).toBeInTheDocument();
    expect(api.getCatalogueSuggestion).toHaveBeenCalledTimes(1);
    expect(api.getCatalogueSuggestion).toHaveBeenCalledWith('local:regel:50x150', { source: 'https://example.com/trall', country: 'SE' });
  });

  it('prepares a GitHub issue as soon as it opens, with one link and no popup', async () => {
    api.getCatalogueSuggestion.mockResolvedValue({
      snippet: 'country: SE\nproducts:\n- type: regel\n', url: 'https://github.com/nordstad/partsible/issues/new?template=x',
    });
    const open = vi.spyOn(window, 'open');
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(within(rowOf('Framing timber 48 × 98 mm')).getByRole('button', { name: 'Suggest to Partsible' }));
    const form = screen.getByRole('form', { name: 'Suggest to Partsible' });
    expect(within(form).getByLabelText('Source URL')).toHaveValue('https://www.traguiden.se/');
    expect(within(form).getByLabelText('Country')).toHaveValue('SE');

    const link = await within(form).findByRole('link', { name: 'Open on GitHub' });
    expect(api.getCatalogueSuggestion).toHaveBeenCalledWith('local:regel:48x98', { source: 'https://www.traguiden.se/', country: 'SE' });
    expect(link).toHaveAttribute('href', expect.stringContaining('github.com/nordstad/partsible/issues/new'));
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(form).getByTestId('suggestion-snippet')).toHaveTextContent('type: regel');
    expect(within(form).getAllByRole('button').map((b) => b.textContent)).toEqual(['Close']);
    expect(open).not.toHaveBeenCalled();
  });

  it('says what happens next once the issue is opened', async () => {
    api.getCatalogueSuggestion.mockResolvedValue({ snippet: 'type: regel', url: 'https://github.com/nordstad/partsible/issues/new?x' });
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(within(rowOf('Framing timber 48 × 98 mm')).getByRole('button', { name: 'Suggest to Partsible' }));
    const form = screen.getByRole('form', { name: 'Suggest to Partsible' });
    expect(within(form).queryByText(/reviewed/i)).not.toBeInTheDocument();
    const link = await within(form).findByRole('link', { name: 'Open on GitHub' });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    expect(within(form).getByRole('status')).toHaveTextContent(/reviewed/i);
    expect(within(form).getByRole('status')).toHaveTextContent(/local product keeps working/i);
  });

  it('shows why an issue could not be prepared', async () => {
    api.getCatalogueSuggestion.mockRejectedValue(new Error('the source must be an https URL'));
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 45 × 95 mm');
    fireEvent.click(within(rowOf('Framing timber 48 × 98 mm')).getByRole('button', { name: 'Suggest to Partsible' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('the source must be an https URL');
  });

  it('flags a local product that is now built in', async () => {
    api.getAdminCatalogue.mockResolvedValue([
      ...listing(),
      { product: product('local:regel:45x95', 'regel', 45, 95), origin: 'local', hidden: false },
    ]);
    render(<AdminCatalogue />);
    await screen.findByText('Framing timber 48 × 98 mm');
    const [builtIn, local] = screen.getAllByText('Framing timber 45 × 95 mm').map((node) => node.closest('tr'));
    expect(within(local).getByText(/now built in/i)).toBeInTheDocument();
    expect(within(builtIn).queryByText(/now built in/i)).not.toBeInTheDocument();
    expect(within(rowOf('Framing timber 48 × 98 mm')).queryByText(/now built in/i)).not.toBeInTheDocument();
  });

  it('shows a load error', async () => {
    api.getAdminCatalogue.mockRejectedValue(new Error('Admin access required'));
    render(<AdminCatalogue />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Admin access required');
  });
});

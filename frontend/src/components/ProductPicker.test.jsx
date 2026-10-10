import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '../i18n';
import ProductPicker, { StockSuggestions } from './ProductPicker';
import { createCatalogueEntry, getCatalogue } from '../utils/api';
import { AuthContext } from '../contexts/authState';
import {
  emptySelection, freeTextSelection, resetCatalogueCache, suggestSelection, typeSelection,
} from '../utils/catalogue';

vi.mock('../utils/api', () => ({ getCatalogue: vi.fn(), createCatalogueEntry: vi.fn() }));

const entry = (id, type, thickness, width, extra = {}) => ({
  id, type, kind: 'board', country: 'SE', thickness, width, lengths: [2400, 3000], max_length: null,
  formats: [], species: ['spruce', 'pine'], treatments: ['untreated'], grades: ['C14', 'C24'],
  profiles: [], sources: ['https://www.traguiden.se/'], note: null, ...extra,
});

const catalogue = {
  country: 'SE',
  country_name: 'Sweden',
  types: [
    { key: 'regel', kind: 'board', rank: 10, labels: { en: 'Framing timber', sv: 'Träreglar', nb: 'Reisverk' }, aliases: ['stud'], details: ['species', 'treatment', 'grade'] },
    { key: 'trall', kind: 'board', rank: 20, labels: { en: 'Decking', sv: 'Trall', nb: 'Terrassebord' }, aliases: [], details: ['species'] },
    { key: 'custom', kind: 'board', rank: 999, labels: { en: 'Other', sv: 'Annat' }, aliases: [], details: ['species'] },
    { key: 'plywood', kind: 'sheet', rank: 10, labels: { en: 'Plywood' }, aliases: [], details: [] },
  ],
  details: {
    species: [
      { key: 'spruce', labels: { en: 'Spruce', sv: 'Gran', nb: 'Gran' } },
      { key: 'pine', labels: { en: 'Pine', sv: 'Furu', nb: 'Furu' } },
    ],
    treatment: [{ key: 'untreated', labels: { en: 'Untreated', sv: 'Obehandlad', nb: 'Ubehandlet' } }],
    profile: [],
  },
  products: [
    entry('se:regel:45x95', 'regel', 45, 95),
    entry('se:regel:45x70', 'regel', 45, 70),
    entry('se:trall:28x120', 'trall', 28, 120),
  ],
};

const Harness = ({ initial = emptySelection(), onSelect = () => {}, ...props }) => {
  const [value, setValue] = useState(initial);
  return (
    <ProductPicker
      kind="board"
      label="Product"
      value={value}
      onChange={(next) => { setValue(next); onSelect(next); }}
      {...props}
    />
  );
};

const show = async (ui) => {
  let view;
  await act(async () => { view = render(ui); });
  return view;
};

beforeEach(() => {
  localStorage.clear();
  resetCatalogueCache();
  getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
});

const box = () => screen.getByRole('combobox', { name: 'Product' });

describe('searching and picking', () => {
  it('lists the product types before anything is typed, most common first', async () => {
    await show(<Harness />);
    fireEvent.focus(box());

    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Framing timberany size', 'Deckingany size']);
    expect(box()).toHaveAttribute('aria-expanded', 'true');
  });

  it('finds a product by size and selects it with the mouse', async () => {
    const onSelect = vi.fn();
    await show(<Harness onSelect={onSelect} />);
    fireEvent.change(box(), { target: { value: '45 × 95' } });

    fireEvent.mouseDown(screen.getByRole('option', { name: /^Framing timber 45 × 95 mm/ }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'regel', suggested: false }));
    expect(onSelect.mock.calls[0][0].product.id).toBe('se:regel:45x95');
    expect(screen.getByTestId('product-summary')).toHaveTextContent('Framing timber 45 × 95 mm');
    expect(box()).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('works from the keyboard: arrows move, Enter picks, Escape closes', async () => {
    await show(<Harness />);
    box().focus();
    fireEvent.change(box(), { target: { value: 'regel' } });

    const active = () => box().getAttribute('aria-activedescendant');
    const first = active();
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute('id', first);

    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(active()).not.toBe(first);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(active()).toBe(first);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(/as my own product/);

    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.change(box(), { target: { value: 'decking' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('product-summary')).toHaveTextContent('Decking');
  });

  it('ignores Enter and Escape while the list is closed', async () => {
    await show(<Harness />);
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(screen.getByTestId('product-summary')).toHaveTextContent('No product chosen');
  });

  it('always offers the typed words as the user\'s own product', async () => {
    const onSelect = vi.fn();
    await show(<Harness onSelect={onSelect} />);
    fireEvent.change(box(), { target: { value: 'Oak beam' } });

    expect(screen.getByText(/No matching/i, { selector: 'li' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Use “Oak beam” as my own product' }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'custom', text: 'Oak beam' }));
  });

  it('marks the highlighted row on hover and closes when focus leaves', async () => {
    await show(<><Harness /><button type="button">elsewhere</button></>);
    fireEvent.focus(box());
    const [, second] = screen.getAllByRole('option');
    fireEvent.mouseEnter(second);
    expect(second).toHaveAttribute('aria-selected', 'true');

    fireEvent.blur(box(), { relatedTarget: screen.getByRole('button', { name: 'elsewhere' }) });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('remembers a chosen product for its cross-section, but not a cleared one', async () => {
    await show(<Harness memoryKey="board:45x95" />);
    fireEvent.change(box(), { target: { value: 'regel 45x95' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: /^Framing timber 45 × 95 mm/ }));
    expect(JSON.parse(localStorage.getItem('planqer-product-choice-v1'))['board:45x95'].type).toBe('regel');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(localStorage.getItem('planqer-product-choice-v1')).toBe('{}');
  });
});

describe('suggestions', () => {
  const suggested = () => suggestSelection(catalogue, 'board', { thickness: 45, width: 95 });

  it('shows a suggestion as Suggested until it is confirmed', async () => {
    const onSelect = vi.fn();
    await show(<Harness initial={suggested()} onSelect={onSelect} memoryKey="board:45x95" />);
    expect(screen.getByTestId('product-summary')).toHaveTextContent('Suggested');
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://www.traguiden.se/');

    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }));

    expect(screen.getByTestId('product-summary')).not.toHaveTextContent('Suggested');
    expect(screen.queryByRole('button', { name: 'Looks right' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('planqer-product-choice-v1'))['board:45x95'].suggested).toBe(false);
  });

  it('changing a suggested product replaces it', async () => {
    await show(<Harness initial={suggested()} />);
    fireEvent.change(box(), { target: { value: 'trall' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: /^Decking 28 × 120 mm/ }));
    expect(screen.getByTestId('product-summary')).not.toHaveTextContent('Suggested');
    expect(screen.getByTestId('product-summary')).toHaveTextContent('Decking 28 × 120 mm');
  });

  it('offers a product\'s size and lengths as buttons that change nothing until pressed', async () => {
    const onUseDimensions = vi.fn();
    const onUseLengths = vi.fn();
    await show(
      <Harness
        initial={suggested()}
        dims={{ thickness: 44, width: 96 }}
        onUseDimensions={onUseDimensions}
        onUseLengths={onUseLengths}
      />,
    );

    expect(onUseDimensions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use 45 × 95 mm' }));
    expect(onUseDimensions).toHaveBeenCalledWith(expect.objectContaining({ id: 'se:regel:45x95' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use these lengths' }));
    expect(onUseLengths).toHaveBeenCalledWith([2400, 3000]);
    expect(screen.getByTestId('stock-suggestions')).toHaveTextContent(/Standard lengths: 2.400, 3.000 mm/);
  });
});

describe('details', () => {
  it('keeps details folded and optional, and records what is chosen', async () => {
    const onSelect = vi.fn();
    await show(<Harness initial={suggestSelection(catalogue, 'board', { thickness: 45, width: 95 })} onSelect={onSelect} />);
    expect(screen.queryByLabelText(/^Species/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    fireEvent.change(screen.getByLabelText(/^Species/), { target: { value: 'spruce' } });
    fireEvent.change(screen.getByLabelText(/^Treatment/), { target: { value: 'untreated' } });
    fireEvent.change(screen.getByLabelText(/^Grade/), { target: { value: 'C24' } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'kiln dried' } });

    const last = onSelect.mock.calls.at(-1)[0];
    expect(last.details).toEqual({ species: 'spruce', treatment: 'untreated', grade: 'C24', profile: '', text: 'kiln dried' });
    expect(last.suggested).toBe(false);
    expect(screen.getByTestId('product-summary')).toHaveTextContent('Framing timber 45 × 95 mm (Spruce, Untreated, C24, kiln dried)');
  });

  it('shows only the details that apply to the type, and offers the product\'s own options', async () => {
    await show(<Harness initial={typeSelection(catalogue.types[1], catalogue.products[2])} />);
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));

    expect(screen.getByLabelText(/^Species/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Treatment/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Grade/)).not.toBeInTheDocument();
  });

  it('keeps a detail the catalogue does not list, as typed', async () => {
    const selection = { ...typeSelection(catalogue.types[0], catalogue.products[0]), details: { ...emptySelection().details, species: 'Larch' } };
    await show(<Harness initial={selection} />);
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));

    expect(within(screen.getByLabelText(/^Species/)).getByRole('option', { name: 'Larch' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Species/)).toHaveValue('Larch');
  });

  it('has no details to fill in for the user\'s own words', async () => {
    await show(<Harness initial={freeTextSelection('board', 'Oak beam')} />);
    expect(screen.queryByRole('button', { name: /Details/ })).not.toBeInTheDocument();
  });

  it('can clear the choice', async () => {
    const onSelect = vi.fn();
    await show(<Harness initial={freeTextSelection('board', 'Oak beam')} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onSelect).toHaveBeenCalledWith(emptySelection());
    expect(screen.getByTestId('product-summary')).toHaveTextContent('No product chosen');
  });
});

describe('when the catalogue cannot be loaded', () => {
  it('says so and still lets the user type their own product', async () => {
    getCatalogue.mockRejectedValue(new Error('offline'));
    const onSelect = vi.fn();
    await show(<Harness onSelect={onSelect} />);

    expect(screen.getByTestId('product-summary')).toHaveTextContent(/could not be loaded/);
    fireEvent.focus(box());
    expect(screen.getByRole('listbox')).toHaveTextContent(/could not be loaded/);
    fireEvent.change(box(), { target: { value: 'Pine' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Use “Pine” as my own product' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ text: 'Pine' }));
  });

  it('shows a loading note while waiting', async () => {
    getCatalogue.mockReturnValue(new Promise(() => {}));
    await show(<Harness />);
    fireEvent.focus(box());
    expect(screen.getByRole('listbox')).toHaveTextContent('Loading…');
  });
});

describe('StockSuggestions', () => {
  const sheetEntry = { ...entry('se:plywood:15', 'plywood', 15, null), kind: 'sheet', lengths: [], formats: [{ width: 1200, height: 2400 }, { width: 1220, height: 2440 }] };

  it('offers standard sheet formats', () => {
    const onUseFormat = vi.fn();
    render(<StockSuggestions selection={typeSelection(catalogue.types[3], sheetEntry)} onUseFormat={onUseFormat} />);

    fireEvent.click(screen.getByRole('button', { name: /1.220 × 2.440 mm/ }));
    expect(onUseFormat).toHaveBeenCalledWith({ width: 1220, height: 2440 });
  });

  it('mentions how long a product is normally stocked, and shows nothing without a product', () => {
    const glulam = entry('se:limtra:90x90', 'regel', 90, 90, { lengths: [], max_length: 12000 });
    const { container, rerender } = render(<StockSuggestions selection={typeSelection(catalogue.types[0], glulam)} />);
    expect(container).toHaveTextContent(/Normally stocked up to 12.000 mm/);

    rerender(<StockSuggestions selection={emptySelection()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<StockSuggestions selection={typeSelection(catalogue.types[0])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not offer a size the form already has', () => {
    const { container } = render(
      <StockSuggestions
        selection={typeSelection(catalogue.types[0], catalogue.products[0])}
        dims={{ thickness: 45, width: 95 }}
        onUseDimensions={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ProductPicker: saving your own product to the local catalogue (admins)', () => {
  const renderAs = (user) => {
    resetCatalogueCache();
    localStorage.clear();
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"a"' });
    return render(
      <AuthContext.Provider value={{ user }}>
        <Harness kind="board" initial={freeTextSelection('board', 'Kärnfuru 48x98')} dims={{ thickness: 48, width: 98 }} />
      </AuthContext.Provider>,
    );
  };

  it('is offered to admins only', async () => {
    const { unmount } = renderAs({ is_admin: false });
    await screen.findByTestId('product-summary');
    expect(screen.queryByRole('button', { name: 'Save to local catalogue' })).not.toBeInTheDocument();
    unmount();
    renderAs({ is_admin: true });
    expect(await screen.findByRole('button', { name: 'Save to local catalogue' })).toBeInTheDocument();
  });

  it('is not offered without an auth context', async () => {
    resetCatalogueCache();
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"a"' });
    render(<Harness kind="board" initial={freeTextSelection('board', 'x')} />);
    await screen.findByTestId('product-summary');
    expect(screen.queryByRole('button', { name: 'Save to local catalogue' })).not.toBeInTheDocument();
  });

  it('saves the typed words with the form size and selects the new product', async () => {
    createCatalogueEntry.mockResolvedValue({ product: entry('local:regel:48x98', 'regel', 48, 98, { country: 'SE' }), origin: 'local', hidden: false });
    renderAs({ is_admin: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Save to local catalogue' }));
    const group = screen.getByRole('group', { name: 'Save to local catalogue' });
    expect(within(group).getByLabelText('Thickness (mm)')).toHaveValue('48');
    expect(within(group).getByLabelText('Width (mm)')).toHaveValue('98');
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    expect(await within(group).findByRole('alert')).toHaveTextContent('Choose a type');
    fireEvent.change(within(group).getByLabelText('Product type'), { target: { value: 'regel' } });
    await act(async () => { fireEvent.click(within(group).getByRole('button', { name: 'Save' })); });
    expect(createCatalogueEntry).toHaveBeenCalledWith({ type: 'regel', thickness: 48, width: 98, note: 'Kärnfuru 48x98' });
    expect(await screen.findByText(/Framing timber 48 × 98 mm/)).toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('./CatalogPage', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../utils/api', async (importOriginal) => ({ ...(await importOriginal()), createProjectGroup: vi.fn(), getProjectGroups: vi.fn(), createWallpaperPlan: vi.fn(), saveWallpaperProject: vi.fn() }));

const { default: WallpaperOptimizer } = await import('./WallpaperOptimizer');
const { default: i18n } = await import('../i18n');
const { createProjectGroup, createWallpaperPlan, saveWallpaperProject } = await import('../utils/api');

const openCorners = () => screen.getAllByRole('button', { name: /^Change corner/ }).forEach((button) => fireEvent.click(button));

const fillOpening = (values) => Object.entries(values).forEach(([label, value]) => fireEvent.change(screen.getByLabelText(label), { target: { value } }));

const openRoomStep = async () => {
  render(<MemoryRouter><WallpaperOptimizer /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(/^Wallpaper name|^Name/i), { target: { value: 'Willow' } });
  fireEvent.change(screen.getByLabelText(/Manufacturer/i), { target: { value: 'Example' } });
  fireEvent.click(screen.getByRole('button', { name: /Measure the room →/ }));
  await screen.findByRole('heading', { name: 'Measure the room' });
};

describe('WallpaperOptimizer room step', () => {
  it('explains an opening that does not fit and blocks the plan', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add opening or obstacle' }));
    fillOpening({ 'From left edge (mm)': '1000', 'From floor (mm)': '900', 'Width (mm)': '1200', 'Height (mm)': '1200' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Wall height/), { target: { value: '1200' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/too tall/);
    expect(screen.getByRole('button', { name: /Create plan/ })).toBeDisabled();
  });

  it('pre-fills only standard opening sizes and leaves guesses empty', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add opening or obstacle' }));

    expect(screen.getByLabelText('Type')).toHaveValue('window');
    ['From left edge (mm)', 'From floor (mm)', 'Width (mm)', 'Height (mm)'].forEach((label) => expect(screen.getByLabelText(label)).toHaveValue(''));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText(/4 required fields empty: Window: From left edge/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Create plan/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'outlet' } });
    expect(screen.getByLabelText('From left edge (mm)')).toHaveValue('');
    expect(screen.getByLabelText('From floor (mm)')).toHaveValue('250');
    expect(screen.getByLabelText('Width (mm)')).toHaveValue('85');
    expect(screen.getByLabelText('Height (mm)')).toHaveValue('85');
  });

  it('keeps a typed opening value when the type changes', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add opening or obstacle' }));
    fillOpening({ 'From left edge (mm)': '700', 'Width (mm)': '100' });

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'switch' } });

    expect(screen.getByLabelText('From left edge (mm)')).toHaveValue('700');
    expect(screen.getByLabelText('Width (mm)')).toHaveValue('100');
    expect(screen.getByLabelText('From floor (mm)')).toHaveValue('1100');
  });

  it('blocks a fifth wall that lands on the first one and says the room already closed', async () => {
    await openRoomStep();
    for (let wall = 0; wall < 4; wall += 1) fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Wall E runs into Wall A');
    expect(screen.getByRole('alert')).toHaveTextContent('The room already closes after Wall D');
    expect(screen.getByRole('button', { name: /Create plan/ })).toBeDisabled();
    expect(screen.getByTestId('clashing-wall')).toBeInTheDocument();
  });

  it('adds a closing corner when the room is marked closed and offers wall-run breaks only while open', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));
    expect(screen.queryByLabelText(/closed room/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));
    expect(screen.getAllByText(/Wall [A-Z] → Wall [A-Z]/)).toHaveLength(2);
    openCorners();
    expect(screen.getAllByRole('option', { name: /start a new wall run/ })).toHaveLength(2);

    fireEvent.click(screen.getByLabelText(/closed room/));

    expect(screen.getAllByText(/Wall [A-Z] → Wall [A-Z]/)).toHaveLength(3);
    expect(screen.queryByRole('option', { name: /start a new wall run/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Wall C → Wall A/)).toBeInTheDocument();
  });

  it('keeps Add wall before the room settings', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));

    const addWall = screen.getByRole('button', { name: 'Add wall' });
    const settings = screen.getByRole('heading', { name: 'Room settings' });
    expect(addWall.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps one wall open at a time and summarises the closed ones', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));

    const [wallA, wallB] = screen.getAllByRole('button', { name: /^Wall [AB],/ });
    expect(wallA).toHaveAttribute('aria-expanded', 'false');
    expect(wallA).toHaveTextContent('2400 × 2400 mm');
    expect(wallB).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(wallA);
    expect(wallA).toHaveAttribute('aria-expanded', 'true');
    expect(wallB).toHaveAttribute('aria-expanded', 'false');
  });

  it('treats an empty wall width as missing, not as an error, and links to it from the plan button', async () => {
    await openRoomStep();
    fireEvent.change(screen.getByLabelText(/^Wall width/), { target: { value: '' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('1 required field empty: Wall width').length).toBeGreaterThan(0);
    expect(screen.getByText('Fill in Wall width on Wall A to create the plan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create plan/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to Wall A' })).toBeInTheDocument();
  });

  it('marks required fields and keeps the unit in the accessible name', async () => {
    await openRoomStep();

    expect(screen.getByLabelText('Wall width (mm)')).toHaveAttribute('aria-required', 'true');
  });

  it('defaults every inside corner to a 15 mm overlap so a plan can be created at once', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));
    expect(screen.getByText(/Inside corner · overlap 15 mm/)).toBeInTheDocument();
    openCorners();

    expect(screen.getByLabelText('Hanging decision')).toHaveValue('overlap');
    expect(screen.getByRole('option', { name: /Overlap 15 mm at the corner/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create plan/ })).not.toBeDisabled();
  });

  it('defaults an outside corner to wrapping and returns to the overlap when switched back to inside', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));
    openCorners();

    fireEvent.change(screen.getByLabelText('Corner type'), { target: { value: 'outside' } });
    expect(screen.getByLabelText('Hanging decision')).toHaveValue('continue');
    expect(screen.queryByRole('option', { name: /Overlap 15 mm/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Corner type'), { target: { value: 'inside' } });
    expect(screen.getByLabelText('Hanging decision')).toHaveValue('overlap');
  });

  it('names walls with letters clockwise', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));

    expect(screen.getByText('Wall A → Wall B')).toBeInTheDocument();
  });

  it('offers an optional price per roll on the wallpaper step', () => {
    render(<MemoryRouter><WallpaperOptimizer /></MemoryRouter>);

    expect(screen.getByLabelText(/^Price per roll/)).toHaveValue('');
    expect(screen.getByLabelText(/^Price per roll/)).not.toHaveAttribute('aria-required');
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('names the empty required fields and flags them only after Continue', () => {
    render(<MemoryRouter><WallpaperOptimizer /></MemoryRouter>);

    expect(screen.getByText('2 required fields empty: Name, Manufacturer')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).not.toHaveClass('form-input-error');

    fireEvent.click(screen.getByRole('button', { name: /Measure the room →/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('Fill in Name, Manufacturer to continue.');
    expect(screen.getByLabelText('Name')).toHaveClass('form-input-error');
    expect(screen.queryByRole('heading', { name: 'Measure the room' })).not.toBeInTheDocument();
  });

  it('shows a live room preview with the start marked', async () => {
    await openRoomStep();
    expect(screen.getByRole('complementary', { name: 'Room preview' })).toBeInTheDocument();
    expect(screen.getByTestId('start-marker')).toBeInTheDocument();
  });

  it('hides height, shape and openings for a wall with no wallpaper and draws it as open', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByLabelText(/No wallpaper on this wall/));

    expect(screen.queryByLabelText(/^Wall height/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add opening or obstacle' })).not.toBeInTheDocument();
    expect(screen.getByTestId('open-wall')).toBeInTheDocument();
  });

  it('uses the chosen corner overlap in the hanging options and blocks an invalid value', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));

    fireEvent.change(screen.getByLabelText('Corner overlap (mm)'), { target: { value: '25' } });
    openCorners();
    expect(screen.getByRole('option', { name: /Overlap 25 mm at the corner/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Corner overlap (mm)'), { target: { value: '-3' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/between 0 and 50/);
  });
});

const planFixture = {
  rolls_needed: 5, rolls_to_buy: 6, area_estimate_rolls: 5, warnings: [], errors: [], closure: null, corners: [],
  waste: { pattern: 3000, allowance: 1000, trim: 4200, offcut: 13000 },
  material: {
    bought_length: 50250, used_length: 34000, offcuts_reused_count: 0, offcuts_reused_length: 0,
    short_pieces_count: 2, short_pieces_length: 600, largest_leftover: 2330,
    fit: { longest_piece: 2400, full_pieces: 12, pieces_per_roll: 3, length_for_next: 10380, shortfall: 330 },
  },
  start_candidates: [
    { wall_index: 0, first_strip_widths: [405], rolls_needed: 5, narrowest_strip: 405, feasible: true },
    { wall_index: 0, first_strip_widths: [331], rolls_needed: 6, narrowest_strip: 331, feasible: true },
  ],
  strips: [{ number: 1, wall_index: 0, x_start: 0, x_end: 530, width: 530, top_height: 2400, segments: [{ wall_index: 0, x_start: 0, x_end: 530, width: 530, top_height: 2400 }] }],
  pieces: [{ id: 'piece-1', strip_number: 1, wall_index: 0, y_start: 2100, y_end: 2400, phase: 0, notches: [], segments: [{ wall_index: 0, x_start: 0, x_end: 530, notches: [] }] }],
  rolls: [{ number: 1, cuts: [], offcut_length: 0 }],
};

describe('WallpaperOptimizer plan step', () => {
  const openPlanStep = async (plan = planFixture) => {
    createWallpaperPlan.mockResolvedValue(plan);
    render(<MemoryRouter><WallpaperOptimizer /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: 'Willow' } });
    fireEvent.change(screen.getByLabelText(/Manufacturer/i), { target: { value: 'Example' } });
    fireEvent.change(screen.getByLabelText(/^Price per roll/), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /Measure the room →/ }));
    await screen.findByRole('heading', { name: 'Measure the room' });
    fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
    await screen.findByRole('heading', { name: 'Your wallpaper plan' });
  };

  it('explains spare rolls, the cost with its currency and the short pieces cut from leftovers', async () => {
    await openPlanStep();

    expect(screen.getByTestId('spare-rolls')).toHaveTextContent('5 needed + 1 spare (10% margin)');
    expect(screen.getByTestId('estimated-cost')).toHaveTextContent(/6.000 SEK/);
    expect(screen.getByTestId('offcut-reuse')).toHaveTextContent('2 pieces (600 mm) cut from leftover roll length');
    expect(screen.getByTestId('opening-trim')).toHaveTextContent('not taken from the rolls');
  });

  it('says what a longer roll would fit and draws the short piece over the opening', async () => {
    await openPlanStep();

    expect(screen.getByTestId('roll-fit-hint')).toHaveTextContent('Only 3 full-height pieces fit on a 10050 mm roll');
    expect(screen.getByTestId('partial-piece')).toHaveTextContent('300 mm piece');
    expect(screen.getByTestId('piece-id')).toHaveTextContent('piece-1');
  });

  it('draws every piece of the wall on the Cut step', async () => {
    await openPlanStep({
      ...planFixture,
      pieces: [...planFixture.pieces, { ...planFixture.pieces[0], id: 'piece-2', y_start: 0, y_end: 2100 }],
    });

    fireEvent.click(screen.getByRole('button', { name: /Prepare cut sheets/ }));

    expect(await screen.findAllByTestId('piece-drawing')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open drawing of piece-2' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('re-plans with the chosen first strip width', async () => {
    await openPlanStep();

    fireEvent.click(screen.getByRole('button', { name: 'Use' }));

    await screen.findByTestId('start-options');
    expect(createWallpaperPlan).toHaveBeenLastCalledWith(expect.objectContaining({ start: { wall_index: 0, first_strip_width: 331 } }));
  });

  it('creates the project when the plan is saved, with no separate create step', async () => {
    createProjectGroup.mockResolvedValue({ id: 'new-project', name: 'Living room' });
    await openPlanStep();

    fireEvent.click(screen.getByRole('button', { name: /Prepare cut sheets/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save plan/ }));

    expect(await screen.findByLabelText('Plan name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create project' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New project name'), { target: { value: 'Living room' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Save plan/ }).at(-1));

    await waitFor(() => expect(createProjectGroup).toHaveBeenCalledWith('Living room'));
    await waitFor(() => expect(saveWallpaperProject).toHaveBeenCalledWith(expect.objectContaining({ project_group_id: 'new-project' })));
  });

  it('goes back one step at a time from the save step', async () => {
    await openPlanStep();

    fireEvent.click(screen.getByRole('button', { name: /Prepare cut sheets/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save plan/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the cut sheets' }));

    expect(await screen.findByRole('heading', { name: 'Cut one wall at a time' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the plan' }));
    expect(await screen.findByRole('heading', { name: 'Your wallpaper plan' })).toBeInTheDocument();
  });

  it('does not save a plan without a name', async () => {
    await openPlanStep();

    fireEvent.click(screen.getByRole('button', { name: /Prepare cut sheets/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save plan/ }));

    fireEvent.change(await screen.findByLabelText('Plan name'), { target: { value: '   ' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Save plan/ }).at(-1));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(saveWallpaperProject).not.toHaveBeenCalled();
    expect(createProjectGroup).not.toHaveBeenCalled();
  });
});

describe('WallpaperOptimizer translations', () => {
  const inLanguage = async (language, run) => {
    await act(() => i18n.changeLanguage(language));
    try { await run(); } finally { await act(() => i18n.changeLanguage('en-GB')); }
  };

  it('renders the wallpaper step in Norwegian', async () => {
    await inLanguage('nb-NO', () => {
      render(<MemoryRouter><WallpaperOptimizer /></MemoryRouter>);

      expect(screen.getByRole('heading', { name: 'Tapetdetaljer' })).toBeInTheDocument();
      expect(screen.getByLabelText('Produsent')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mål opp rommet →' })).toBeInTheDocument();
    });
  });

  it('translates room step labels and measurement errors in Swedish', async () => {
    await inLanguage('sv-SE', async () => {
      render(<MemoryRouter><WallpaperOptimizer /></MemoryRouter>);
      fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Willow' } });
      fireEvent.change(screen.getByLabelText('Tillverkare'), { target: { value: 'Example' } });
      fireEvent.click(screen.getByRole('button', { name: 'Mät rummet →' }));
      await screen.findByRole('heading', { name: 'Mät rummet' });
      fireEvent.click(screen.getByRole('button', { name: 'Lägg till öppning eller hinder' }));
      fillOpening({ 'Från vänster kant (mm)': '1000', 'Från golv (mm)': '900', 'Bredd (mm)': '1200', 'Höjd (mm)': '1200' });
      fireEvent.change(screen.getByLabelText(/^Väggshöjd|^Vägghöjd/), { target: { value: '1200' } });

      expect(await screen.findByRole('alert')).toHaveTextContent(/för hög vid höger kant/);
      expect(screen.getByDisplayValue('Vägg A')).toBeInTheDocument();
    });
  });
});

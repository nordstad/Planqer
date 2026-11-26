import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: null }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('./CatalogPage', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../utils/api', async (importOriginal) => ({ ...(await importOriginal()), createProjectGroup: vi.fn(), getProjectGroups: vi.fn(), createWallpaperPlan: vi.fn(), saveWallpaperProject: vi.fn(), updateWallpaperProject: vi.fn(), saveWallpaper: vi.fn(), getWallpaperProjects: vi.fn(), getUserSettings: vi.fn().mockResolvedValue({}) }));

const { default: WallpaperOptimizer } = await import('./WallpaperOptimizer');
const { default: i18n } = await import('../i18n');
const { createProjectGroup, createWallpaperPlan, getProjectGroups, getUserSettings, getWallpaperProjects, saveWallpaperProject, saveWallpaper } = await import('../utils/api');

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

describe('WallpaperOptimizer input/result identity', () => {
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const currentPlan = { ...planFixture, rolls_needed: 8, rolls_to_buy: 9 };
  const assertLocked = () => [2, 3, 4].forEach((index) => expect(document.querySelectorAll('.plan-step-btn')[index]).toBeDisabled());
  const completePlan = async (prepare) => {
    await openRoomStep();
    prepare?.();
    fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
    await screen.findByRole('heading', { name: 'Your wallpaper plan' });
  };
  const saveCurrent = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Prepare cut sheets/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save plan/ }));
    fireEvent.change(await screen.findByLabelText('Plan name'), { target: { value: 'Current project' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save plan/ }));
    await waitFor(() => expect(saveWallpaperProject).toHaveBeenCalledTimes(1));
    return saveWallpaperProject.mock.calls[0][0];
  };
  const addSecondWall = () => fireEvent.click(screen.getByRole('button', { name: 'Add wall', exact: true }));
  const prepareOpening = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Add opening or obstacle', exact: true }));
    fillOpening({ 'From left edge (mm)': '0', 'From floor (mm)': '0', 'Width (mm)': '100', 'Height (mm)': '100' });
  };
  const preparePattern = () => {
    fireEvent.click(document.querySelectorAll('.plan-step-btn')[0]);
    fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('wallpaperUi.hasRepeat') }));
    fireEvent.change(screen.getByLabelText('Repeat (mm)'), { target: { value: '640' } });
    fireEvent.click(screen.getByRole('button', { name: /Measure the room →/ }));
  };
  beforeEach(() => {
    auth.user = { id: 'synthetic-user', email: 'test@example.invalid' };
    getProjectGroups.mockResolvedValue([{ id: 'synthetic-group', name: 'Synthetic project' }]);
    getUserSettings.mockResolvedValue({});
    createWallpaperPlan.mockReset().mockResolvedValue(planFixture);
    saveWallpaperProject.mockReset().mockResolvedValue({ id: 'synthetic-plan' });
    saveWallpaper.mockReset().mockResolvedValue({});
  });
  afterEach(() => { auth.user = null; });

  it('locks Plan, Review, and Save when completed-plan measurements change', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
    await screen.findByRole('heading', { name: 'Your wallpaper plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit measurements' }));
    fireEvent.change(screen.getByLabelText('Wall width (mm)'), { target: { value: '4000' } });
    const steps = document.querySelectorAll('.plan-step-btn');
    [2, 3, 4].forEach((index) => expect(steps[index]).toBeDisabled());
    expect(screen.queryByRole('button', { name: /^Prepare cut sheets/ })).not.toBeInTheDocument();
    expect(saveWallpaperProject).not.toHaveBeenCalled();
  });

  it('ignores a pending plan after its wall inputs change', async () => {
    let resolve;
    createWallpaperPlan.mockReturnValueOnce(new Promise((yes) => { resolve = yes; }));
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
    fireEvent.change(screen.getByLabelText('Wall width (mm)'), { target: { value: '4000' } });
    await act(async () => { resolve(planFixture); });
    expect(screen.queryByRole('heading', { name: 'Your wallpaper plan' })).not.toBeInTheDocument();
    [2, 3, 4].forEach((index) => expect(document.querySelectorAll('.plan-step-btn')[index]).toBeDisabled());
  });

  it.each([
    ['name', '#wallpaper-name', 'Other paper'],
    ['manufacturer', '#wallpaper-manufacturer', 'Other maker'],
    ['roll width', '#wallpaper-roll-width', '600'],
    ['roll length', '#wallpaper-roll-length', '11000'],
    ['spare margin', '#wallpaper-spare-margin', '15'],
    ['repeat', '#wallpaper-repeat', '1280'],
    ['start style', '#wallpaper-start-style', 'even'],
    ['price', null, '250'],
  ])('retires a completed plan after changing wallpaper %s', async (name, selector, value) => {
    await completePlan(preparePattern);
    fireEvent.click(document.querySelectorAll('.plan-step-btn')[0]);
    const input = name === 'price' ? screen.getByLabelText(/^Price per roll/) : document.querySelector(selector);
    fireEvent.change(input, { target: { value } });
    assertLocked();
    expect(saveWallpaperProject).not.toHaveBeenCalled();
  });

  it.each(['pattern enabled', 'pattern match'])('retires a completed plan after changing %s', async (field) => {
    await completePlan(preparePattern);
    fireEvent.click(document.querySelectorAll('.plan-step-btn')[0]);
    if (field === 'pattern enabled') fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('wallpaperUi.hasRepeat') }));
    else fireEvent.change(screen.getByLabelText(i18n.t('wallpaperUi.match')), { target: { value: 'half_drop' } });
    assertLocked();
  });

  it.each([
    ['wall height', null, () => fireEvent.change(screen.getByLabelText('Wall height (mm)'), { target: { value: '2600' } })],
    ['wall name', null, () => fireEvent.change(screen.getByLabelText('Wall name'), { target: { value: 'Other wall' } })],
    ['wall shape', null, () => fireEvent.click(screen.getByRole('radio', { name: 'Sloped', exact: true }))],
    ['skip wall', null, () => fireEvent.click(screen.getByLabelText(/No wallpaper on this wall/))],
    ['add wall', null, addSecondWall],
    ['remove wall', addSecondWall, () => fireEvent.click(screen.getByRole('button', { name: /Remove Wall B/i }))],
    ['corner type', addSecondWall, () => { openCorners(); fireEvent.change(screen.getByLabelText('Corner type'), { target: { value: 'outside' } }); }],
    ['hanging decision', addSecondWall, () => { openCorners(); fireEvent.change(screen.getByLabelText('Hanging decision'), { target: { value: 'start_new' } }); }],
    ['corner overlap', addSecondWall, () => fireEvent.change(screen.getByLabelText('Corner overlap (mm)'), { target: { value: '25' } })],
    ['closed room', () => { addSecondWall(); addSecondWall(); }, () => fireEvent.click(screen.getByLabelText(/Walls form a closed room/))],
    ['add opening', null, () => fireEvent.click(screen.getByRole('button', { name: 'Add opening or obstacle', exact: true }))],
    ['edit opening', prepareOpening, () => fireEvent.change(screen.getByLabelText('Width (mm)'), { target: { value: '200' } })],
    ['remove opening', prepareOpening, () => fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }))],
    ['sloped edge', () => fireEvent.click(screen.getByRole('radio', { name: 'Sloped', exact: true })), () => fireEvent.change(screen.getByLabelText('Lower left (mm)'), { target: { value: '50' } })],
  ])('retires a completed plan after changing %s', async (_name, prepare, change) => {
    await completePlan(prepare);
    fireEvent.click(screen.getByRole('button', { name: 'Edit measurements' }));
    change();
    assertLocked();
  });

  for (const order of ['old-first', 'new-first']) {
    it.each(['success', 'failure'])(`ignores an obsolete %s with ${order} completion and saves current inputs`, async (outcome) => {
      const old = deferred();
      const current = deferred();
      createWallpaperPlan.mockReset().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      await openRoomStep();
      fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
      fireEvent.change(screen.getByLabelText('Wall width (mm)'), { target: { value: '4000' } });
      expect(screen.getByRole('button', { name: /Create plan/ })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
      const finishOld = async () => act(async () => {
        if (outcome === 'success') old.resolve(planFixture);
        else old.reject(new Error('Obsolete failure'));
      });
      if (order === 'old-first') {
        await finishOld();
        expect(screen.getByRole('button', { name: /Create plan/ })).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('Calculating');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        await act(async () => { current.resolve(currentPlan); });
      } else {
        await act(async () => { current.resolve(currentPlan); });
        await screen.findByRole('heading', { name: 'Your wallpaper plan' });
        await finishOld();
      }
      expect(screen.getByTestId('spare-rolls')).toHaveTextContent('8 needed');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      const body = await saveCurrent();
      expect(body.room_data.walls[0].width_top).toBe(4000);
      expect(body.plan_result.rolls_to_buy).toBe(9);
      expect(body.options_data.start).toBeNull();
    });
  }

  it.each(['success', 'failure'])('ignores an obsolete alternative-start %s after measurements change', async (outcome) => {
    await completePlan();
    const old = deferred();
    createWallpaperPlan.mockReturnValueOnce(old.promise).mockResolvedValueOnce(currentPlan);
    fireEvent.click(screen.getByRole('button', { name: 'Use', exact: true }));
    expect(screen.getByRole('button', { name: /^Prepare cut sheets/ })).toBeDisabled();
    expect(document.querySelectorAll('.plan-step-btn')[3]).toBeDisabled();
    expect(document.querySelectorAll('.plan-step-btn')[4]).toBeDisabled();
    expect(screen.queryByText(i18n.t('wallpaperUi.correctRoomMeasurements'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit measurements' }));
    fireEvent.change(screen.getByLabelText('Wall width (mm)'), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
    await screen.findByRole('heading', { name: 'Your wallpaper plan' });
    await act(async () => {
      if (outcome === 'success') old.resolve(planFixture);
      else old.reject(new Error('Obsolete start failure'));
    });
    expect(screen.getByTestId('spare-rolls')).toHaveTextContent('8 needed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const body = await saveCurrent();
    expect(body.room_data.walls[0].width_top).toBe(4000);
    expect(body.plan_result.rolls_to_buy).toBe(9);
    expect(body.options_data.start).toBeNull();
  });

  it('allows retry after a current calculation failure and saves the recalculated result', async () => {
    createWallpaperPlan.mockRejectedValueOnce(new Error('Current calculation failed')).mockResolvedValueOnce(currentPlan);
    await openRoomStep();
    fireEvent.change(screen.getByLabelText('Wall width (mm)'), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current calculation failed');
    assertLocked();
    expect(screen.getByRole('button', { name: /Create plan/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
    await screen.findByRole('heading', { name: 'Your wallpaper plan' });
    const body = await saveCurrent();
    expect(body.room_data.walls[0].width_top).toBe(4000);
    expect(body.plan_result.rolls_to_buy).toBe(9);
  });

  it('keeps the last valid plan after a current alternative-start failure and allows retry', async () => {
    await completePlan();
    createWallpaperPlan.mockRejectedValueOnce(new Error('Current start failed')).mockResolvedValueOnce(currentPlan);
    fireEvent.click(screen.getByRole('button', { name: 'Use', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current start failed');
    expect(screen.getByTestId('spare-rolls')).toHaveTextContent('5 needed');
    expect(screen.getByRole('button', { name: /^Prepare cut sheets/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use', exact: true }));
    await waitFor(() => expect(screen.getByTestId('spare-rolls')).toHaveTextContent('8 needed'));
    const body = await saveCurrent();
    expect(body.options_data.start).toEqual({ wall_index: 0, first_strip_width: 331 });
  });

  it.each([10, 20])('only retires a completed plan when late default margin %s changes its inputs', async (margin) => {
    const settings = deferred();
    getUserSettings.mockReturnValueOnce(settings.promise);
    await completePlan();
    await act(async () => { settings.resolve({ spare_margin_percent: margin }); });
    if (margin === 10) expect(screen.getByRole('heading', { name: 'Your wallpaper plan' })).toBeInTheDocument();
    else {
      assertLocked();
      expect(screen.getByRole('heading', { name: 'Measure the room' })).toBeInTheDocument();
    }
  });
});

describe('WallpaperOptimizer start style', () => {
  const sentStyle = async (choose) => {
    createWallpaperPlan.mockResolvedValue(planFixture);
    render(<MemoryRouter><WallpaperOptimizer /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: 'Willow' } });
    fireEvent.change(screen.getByLabelText(/Manufacturer/i), { target: { value: 'Example' } });
    choose?.();
    fireEvent.click(screen.getByRole('button', { name: /Measure the room →/ }));
    await screen.findByRole('heading', { name: 'Measure the room' });
    fireEvent.click(screen.getByRole('button', { name: /Create plan/ }));
    await screen.findByRole('heading', { name: 'Your wallpaper plan' });
    return createWallpaperPlan.mock.calls.at(-1)[0].start_style;
  };

  it('recommends the start by default', async () => {
    expect(await sentStyle()).toBe('recommended');
  });

  it('sends even when even pieces are chosen', async () => {
    expect(await sentStyle(() => fireEvent.change(screen.getByRole('combobox', { name: /^Start each wall with/ }), { target: { value: 'even' } }))).toBe('even');
  });

  it('names both ways to start', () => {
    render(<MemoryRouter><WallpaperOptimizer /></MemoryRouter>);

    const options = within(screen.getByRole('combobox', { name: /^Start each wall with/ })).getAllByRole('option').map((option) => option.textContent);

    expect(options).toEqual(['Recommended (fewest rolls and cuts)', 'Even pieces at both ends']);
  });
});

describe('WallpaperOptimizer reopening a saved plan', () => {
  const reopen = async (options) => {
    auth.user = { email: 'a@example.com' };
    getUserSettings.mockResolvedValue({});
    getProjectGroups.mockResolvedValue([]);
    getWallpaperProjects.mockResolvedValue([{
      id: 'w1', name: 'Hall', project_group_id: null,
      wallpaper_data: { name: 'Willow', manufacturer: 'Example', roll_width: 530, roll_length: 10050, repeat: 0 },
      room_data: { walls: [{ name: 'A', profile: 'rectangle', width_top: 3000, width_middle: 3000, width_bottom: 3000, height_left: 2400, height_middle: 2400, height_right: 2400, cutouts: [] }], corners: [], closed: false },
      options_data: options, plan_result: planFixture,
    }]);
    render(<MemoryRouter initialEntries={['/wallpaper?edit=w1']}><WallpaperOptimizer /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Your wallpaper plan' });
    fireEvent.click(screen.getByRole('button', { name: /Wallpaper/ }));
    return screen.getByRole('combobox', { name: /^Start each wall with/ });
  };

  afterEach(() => { auth.user = null; });

  it('keeps the start a plan was saved with', async () => {
    expect(await reopen({ start_style: 'recommended' })).toHaveValue('recommended');
  });

  it('reopens a plan saved before the start style existed with even pieces, as it was planned', async () => {
    expect(await reopen({ corner_overlap: '15' })).toHaveValue('even');
  });
});

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
    expect(screen.getByTestId('piece-id')).toHaveTextContent('S1');
  });

  it('draws every piece of the wall on the Cut step', async () => {
    await openPlanStep({
      ...planFixture,
      pieces: [...planFixture.pieces, { ...planFixture.pieces[0], id: 'piece-2', y_start: 0, y_end: 2100 }],
    });

    fireEvent.click(screen.getByRole('button', { name: /Prepare cut sheets/ }));

    expect(await screen.findAllByTestId('piece-drawing')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open drawing of S1b' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('re-plans with the chosen first strip width', async () => {
    await openPlanStep();

    fireEvent.click(screen.getByRole('button', { name: 'Use' }));

    await screen.findByTestId('start-options');
    expect(createWallpaperPlan).toHaveBeenLastCalledWith(expect.objectContaining({ start: { wall_index: 0, first_strip_width: 331 } }));
  });

  it('shows how the start was chosen, what each option costs and which one is best at what', async () => {
    await openPlanStep({
      ...planFixture,
      corner_quality: { minimum: 100, smallest: null, short_corners: [] },
      start: { style: 'recommended', asked_for: false, runs: 2, full_width_runs: 1, cut_strips: 3, fallback: [{ wall: 'B', reason: 'narrow_piece' }], full_width_extra_rolls: null },
      start_candidates: [
        { wall_index: 0, first_strip_widths: [530, 275], rolls_needed: 5, narrowest_strip: 160, feasible: true, cut_strips: 3, full_width_runs: 1, runs: 2, tags: ['fewest_rolls', 'fewest_cuts'] },
        { wall_index: 0, first_strip_widths: [275, 275], rolls_needed: 5, narrowest_strip: 275, feasible: true, cut_strips: 4, full_width_runs: 0, runs: 2, tags: ['fewest_rolls'] },
      ],
    });

    expect(screen.getByTestId('start-summary')).toHaveTextContent('1 of 2 wall runs start with a full-width strip.');
    expect(screen.getByTestId('start-options')).toHaveTextContent('B: a full-width start would leave a piece under 100 mm');
    expect(screen.getByTestId('start-options')).toHaveTextContent('Full-width start on 1 of 2 wall runs');
    expect(screen.getByTestId('start-options')).toHaveTextContent('5 rolls · narrowest 160 mm · 3 strips cut lengthwise');
    expect(screen.getByTestId('start-options')).toHaveTextContent('Fewest rolls · Fewest cuts');
    expect(screen.getAllByRole('button', { name: 'Use' })).toHaveLength(1);
  });

  it('says when starting every wall with a full-width strip would cost more rolls', async () => {
    await openPlanStep({
      ...planFixture,
      start: { style: 'recommended', asked_for: false, runs: 1, full_width_runs: 0, cut_strips: 2, fallback: [{ wall: 'A', reason: 'saves_material' }], full_width_extra_rolls: 1 },
    });

    expect(screen.getByTestId('start-summary')).toHaveTextContent('No wall run starts with a full-width strip.');
    expect(screen.getByTestId('start-options')).toHaveTextContent('A: another start needs less wallpaper.');
    expect(screen.getByTestId('start-extra-rolls')).toHaveTextContent('would need 1 more roll.');
  });

  it('says when another start would need fewer rolls than the one that was forced', async () => {
    await openPlanStep({
      ...planFixture,
      start: { style: 'recommended', asked_for: true, runs: 1, full_width_runs: 0, cut_strips: 2, fallback: [], full_width_extra_rolls: null, rolls_saved_elsewhere: 2 },
    });

    expect(screen.getByTestId('start-summary')).toHaveTextContent('first-strip width you chose');
    expect(screen.getByTestId('start-saves-rolls')).toHaveTextContent('Another start needs 2 fewer rolls.');
  });

  it('still shows a plan saved before the start summary existed', async () => {
    await openPlanStep();

    expect(screen.queryByTestId('start-summary')).not.toBeInTheDocument();
    expect(screen.getAllByText(/narrowest 405 mm$/).length).toBeGreaterThan(0);
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
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the review' }));

    expect(await screen.findByRole('heading', { name: 'Your cut plan' })).toBeInTheDocument();
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

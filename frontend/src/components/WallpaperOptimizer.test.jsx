import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('./CatalogPage', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../utils/api', async (importOriginal) => ({ ...(await importOriginal()), getProjectGroups: vi.fn() }));

const { default: WallpaperOptimizer } = await import('./WallpaperOptimizer');

const openRoomStep = async () => {
  render(<WallpaperOptimizer />);
  fireEvent.change(screen.getByLabelText(/^Wallpaper name|^Name/i), { target: { value: 'Willow' } });
  fireEvent.change(screen.getByLabelText(/Manufacturer/i), { target: { value: 'Example' } });
  fireEvent.click(screen.getByRole('button', { name: /Measure the room →/ }));
  await screen.findByRole('heading', { name: 'Measure the room' });
};

describe('WallpaperOptimizer room step', () => {
  it('explains an opening that does not fit and blocks the plan', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add opening or obstacle' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Wall height/), { target: { value: '1200' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/too tall/);
    expect(screen.getByRole('button', { name: /Create plan/ })).toBeDisabled();
  });

  it('adds a closing corner when the room is marked closed and offers wall-run breaks only while open', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));
    expect(screen.queryByLabelText(/closed room/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));
    expect(screen.getAllByText(/Wall [A-Z] → Wall [A-Z]/)).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: /start a new wall run/ })).toHaveLength(2);

    fireEvent.click(screen.getByLabelText(/closed room/));

    expect(screen.getAllByText(/Wall [A-Z] → Wall [A-Z]/)).toHaveLength(3);
    expect(screen.queryByRole('option', { name: /start a new wall run/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Wall C → Wall A/)).toBeInTheDocument();
  });

  it('defaults every inside corner to a 15 mm overlap so a plan can be created at once', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));

    expect(screen.getByLabelText('Hanging decision')).toHaveValue('overlap');
    expect(screen.getByRole('option', { name: /Overlap 15 mm at the corner/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create plan/ })).not.toBeDisabled();
  });

  it('defaults an outside corner to wrapping and returns to the overlap when switched back to inside', async () => {
    await openRoomStep();
    fireEvent.click(screen.getByRole('button', { name: 'Add wall' }));

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
    render(<WallpaperOptimizer />);

    expect(screen.getByLabelText(/Price per roll/)).toHaveValue('');
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
    expect(screen.getByRole('option', { name: /Overlap 25 mm at the corner/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Corner overlap (mm)'), { target: { value: '-3' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/between 0 and 50/);
  });
});

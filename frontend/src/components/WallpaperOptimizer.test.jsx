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
    expect(screen.getAllByText(/Wall \d → Wall \d/)).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: /start a new wall run/ })).toHaveLength(2);

    fireEvent.click(screen.getByLabelText(/closed room/));

    expect(screen.getAllByText(/Wall \d → Wall \d/)).toHaveLength(3);
    expect(screen.queryByRole('option', { name: /start a new wall run/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Wall 3 → Wall 1/)).toBeInTheDocument();
  });
});

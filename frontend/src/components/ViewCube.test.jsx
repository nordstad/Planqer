import { fireEvent, render, screen } from '@testing-library/react';
import ViewCube from './ViewCube';
import { LanguageProvider } from '../contexts/LanguageContext';

const makeNavigator = () => ({
  viewFrom: vi.fn(),
  rotate: vi.fn(),
  home: vi.fn(),
  setPanning: vi.fn(),
  subscribe: vi.fn((listener) => {
    listener({ x: 0, y: 0, z: 0, w: 1 });
    return vi.fn();
  }),
});

const renderCube = (navigator) => render(
  <LanguageProvider>
    <ViewCube navigator={navigator} />
  </LanguageProvider>,
);

describe('ViewCube', () => {
  it('shows nothing until there is a camera to steer', () => {
    const { container } = renderCube(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('turns the cube with the camera', () => {
    const navigator = makeNavigator();
    const { container } = renderCube(navigator);
    expect(container.querySelector('.view-nav-cube').style.transform)
      .toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });

  it('stops listening to the camera when it goes away', () => {
    const navigator = makeNavigator();
    const unsubscribe = vi.fn();
    navigator.subscribe.mockImplementation(() => unsubscribe);
    const { unmount } = renderCube(navigator);
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('has a labelled button for every face, reachable by keyboard', () => {
    renderCube(makeNavigator());
    ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'].forEach((side) => {
      expect(screen.getByRole('button', { name: `Snap to ${side} view` })).toBeInTheDocument();
    });
  });

  it('looks from a face when its button is pressed', () => {
    const navigator = makeNavigator();
    renderCube(navigator);
    fireEvent.click(screen.getByRole('button', { name: 'Snap to Top view' }));
    expect(navigator.viewFrom).toHaveBeenCalledWith([0, 1, 0]);
  });

  it('makes edges and corners places to look from too', () => {
    const navigator = makeNavigator();
    const { container } = renderCube(navigator);
    expect(container.querySelectorAll('.view-nav-cell.is-edge')).toHaveLength(24);
    expect(container.querySelectorAll('.view-nav-cell.is-corner')).toHaveLength(24);

    fireEvent.click(container.querySelector('.view-nav-cell.is-corner'));
    const [direction] = navigator.viewFrom.mock.calls[0];
    expect(direction.map(Math.abs)).toEqual([1, 1, 1]);
  });

  it('turns the model a quarter turn the way each arrow points', () => {
    const navigator = makeNavigator();
    renderCube(navigator);
    const quarter = Math.PI / 2;

    fireEvent.click(screen.getByRole('button', { name: 'Rotate the model left' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate the model right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate the model up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate the model down' }));

    expect(navigator.rotate.mock.calls).toEqual([
      [quarter, 0],
      [-quarter, 0],
      [0, quarter],
      [0, -quarter],
    ]);
  });

  it('resets the view', () => {
    const navigator = makeNavigator();
    renderCube(navigator);
    fireEvent.click(screen.getByRole('button', { name: 'Reset the view' }));
    expect(navigator.home).toHaveBeenCalledTimes(1);
  });

  it('toggles panning, and says whether it is on', () => {
    const navigator = makeNavigator();
    renderCube(navigator);
    const pan = screen.getByRole('button', { name: 'Pan the view' });
    expect(pan).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pan);
    expect(navigator.setPanning).toHaveBeenLastCalledWith(true);
    expect(pan).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(pan);
    expect(navigator.setPanning).toHaveBeenLastCalledWith(false);
    expect(pan).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts out rotating again for a new viewer', () => {
    const first = makeNavigator();
    const { rerender } = renderCube(first);
    fireEvent.click(screen.getByRole('button', { name: 'Pan the view' }));
    expect(screen.getByRole('button', { name: 'Pan the view' })).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <LanguageProvider>
        <ViewCube navigator={makeNavigator()} />
      </LanguageProvider>,
    );
    expect(screen.getByRole('button', { name: 'Pan the view' })).toHaveAttribute('aria-pressed', 'false');
  });
});

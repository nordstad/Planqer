import { render, screen } from '@testing-library/react';
import NavigationHint from './NavigationHint';
import { LanguageProvider } from '../contexts/LanguageContext';

const withPointer = (coarse) => {
  window.matchMedia = vi.fn((query) => ({ matches: coarse && query === '(pointer: coarse)' }));
};

const renderHint = () => render(
  <LanguageProvider>
    <NavigationHint />
  </LanguageProvider>,
);

afterEach(() => {
  delete window.matchMedia;
});

describe('NavigationHint', () => {
  it('tells mouse users how to rotate, pan and zoom', () => {
    withPointer(false);
    renderHint();
    expect(screen.getByText('Drag to rotate · Shift-drag or right-drag to pan · Scroll to zoom')).toBeInTheDocument();
  });

  it('describes touch gestures on a touch screen, where there are no such buttons', () => {
    withPointer(true);
    renderHint();
    expect(screen.getByText('One finger rotates · Two fingers pan and zoom')).toBeInTheDocument();
  });

  it('falls back to the mouse wording when the browser cannot say', () => {
    renderHint();
    expect(screen.getByText(/Shift-drag or right-drag to pan/)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '../contexts/LanguageContext';
import SheetResultDisplay from './SheetResultDisplay';

const result = {
  visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
  sheets: [{
    sheet_width: 1200,
    sheet_height: 2500,
    efficiency: 51.9,
    parts_count: 1,
    parts: [{ part_id: 'shelf', width: 400, height: 200, x: 0, y: 0, rotated: false }],
  }],
};

describe('SheetResultDisplay', () => {
  it('renders the sheet diagram inline with board-style actions', () => {
    render(
      <LanguageProvider>
        <SheetResultDisplay result={result} projectName="Test plan" />
      </LanguageProvider>,
    );

    expect(screen.getByAltText(/Sheet layout diagram/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download diagram/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View the full diagram/i })).not.toBeInTheDocument();
  });

  it('opens the inline diagram when clicked', () => {
    render(
      <LanguageProvider>
        <SheetResultDisplay result={result} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sheet layout diagram/i }));

    expect(screen.getByRole('dialog', { name: /Sheet layout diagram/i })).toBeInTheDocument();
  });
});

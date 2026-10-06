import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '../contexts/LanguageContext';
import SheetResultDisplay from './SheetResultDisplay';

const result = {
  visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
  sheet_visualizations: [
    'data:image/svg+xml;base64,PHN2Zy8xPg==',
    'data:image/svg+xml;base64,PHN2Zy8yPg==',
  ],
  sheets: [{
    sheet_width: 1200,
    sheet_height: 2500,
    efficiency: 51.9,
    parts_count: 1,
    parts: [{ part_id: 'shelf', width: 400, height: 200, x: 0, y: 0, rotated: false }],
  }, {
    sheet_width: 1200,
    sheet_height: 2500,
    efficiency: 42.5,
    parts_count: 1,
    parts: [{ part_id: 'side', width: 300, height: 200, x: 0, y: 0, rotated: false }],
  }],
};

describe('SheetResultDisplay', () => {
  it('renders the sheet diagram inline with board-style actions', () => {
    render(
      <LanguageProvider>
        <SheetResultDisplay result={result} projectName="Test plan" />
      </LanguageProvider>,
    );

    expect(screen.getByAltText(/Sheet 1: 1\s?200 by 2\s?500 millimetres/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download diagram/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View the full diagram/i })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Sheet by sheet/i })).toHaveValue('0');
  });

  it('opens the inline diagram when clicked', () => {
    render(
      <LanguageProvider>
        <SheetResultDisplay result={result} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sheet 1: 1\s?200 by 2\s?500 millimetres/i }));

    expect(screen.getByRole('dialog', { name: /Sheet layout diagram/i })).toBeInTheDocument();
  });

  it('shows one selected sheet diagram at a time', () => {
    render(
      <LanguageProvider>
        <SheetResultDisplay result={result} />
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /Sheet by sheet/i }), { target: { value: '1' } });

    expect(screen.getByRole('combobox', { name: /Sheet by sheet/i })).toHaveValue('1');
    expect(screen.getByAltText(/Sheet 2: 1\s?200 by 2\s?500 millimetres/i)).toHaveAttribute('src', result.sheet_visualizations[1]);
  });
});

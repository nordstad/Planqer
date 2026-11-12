import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import WallPicker from './WallPicker';

const walls = [{ name: 'Wall A' }, { name: 'Wall B' }];

describe('WallPicker', () => {
  it('selects a wall and exposes the active state', () => {
    const onChange = vi.fn();
    render(<WallPicker walls={walls} value={0} onChange={onChange} />);

    expect(screen.getByRole('radio', { name: 'Wall A' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Wall B' }));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('moves selection with arrow keys', () => {
    const onChange = vi.fn();
    render(<WallPicker walls={walls} value={0} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Wall A' }), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith(1);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RoomOverview from './RoomOverview';

const wall = (name, width) => ({ name, width_top: width, width_middle: width, width_bottom: width });
const corners = (count, kind = 'inside') => Array.from({ length: count }, () => ({ kind }));

describe('RoomOverview', () => {
  it('labels an open run and shows wall names directly', () => {
    render(<RoomOverview walls={[wall('North', 2400), wall('East', 1000), wall('South', 2400)]} corners={corners(2)} plan={{ strips: [] }} />);

    expect(screen.getByText(/Open wall run/)).toBeInTheDocument();
    expect(screen.getByText('North')).toBeInTheDocument();
    expect(screen.queryByLabelText('Wall numbers')).not.toBeInTheDocument();
  });

  it('marks the closure gap of a closed room that does not close', () => {
    const walls = [wall('A', 2400), wall('B', 1000), wall('C', 2400), wall('D', 900)];
    render(<RoomOverview walls={walls} corners={corners(4)} closed plan={{ strips: [], closure: { valid: false, gap: 100 } }} />);

    expect(screen.getByTestId('closure-gap')).toBeInTheDocument();
    expect(screen.getByText(/Closed room/)).toBeInTheDocument();
  });

  it('does not mark a gap for a closed room that closes', () => {
    const walls = [wall('A', 2400), wall('B', 1000), wall('C', 2400), wall('D', 1000)];
    render(<RoomOverview walls={walls} corners={corners(4)} closed plan={{ strips: [], closure: { valid: true, gap: 0 } }} />);

    expect(screen.queryByTestId('closure-gap')).not.toBeInTheDocument();
  });

  it('uses numbered markers and a legend for many walls', () => {
    const walls = Array.from({ length: 15 }, (_, index) => wall(`Wall ${index + 1}`, 2000));
    render(<RoomOverview walls={walls} corners={corners(14)} plan={{ strips: [] }} />);

    expect(screen.getByLabelText('Wall numbers').querySelectorAll('li')).toHaveLength(15);
    expect(screen.getByText('15', { selector: 'text' })).toBeInTheDocument();
  });

  it('describes separate wall runs', () => {
    const walls = [wall('A', 2000), wall('B', 2000), wall('C', 2000)];
    render(<RoomOverview walls={walls} corners={[{ kind: 'inside' }, { kind: 'none' }]} plan={{ strips: [] }} />);

    expect(screen.getByText(/2 separate wall runs/)).toBeInTheDocument();
  });
});

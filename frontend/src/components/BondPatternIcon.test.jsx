import { render } from '@testing-library/react';
import BondPatternIcon from './BondPatternIcon';

describe('BondPatternIcon', () => {
  it('renders the requested readable preview size', () => {
    const { container } = render(<BondPatternIcon pattern="diagonal_double_herringbone" size={44} />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '44');
    expect(container.querySelector('svg')).toHaveAttribute('height', '44');
  });
});

import { render, screen } from '@testing-library/react';
import Loader from './Loader';

describe('Loader', () => {
  it('renders loading spinner', () => {
    render(<Loader />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

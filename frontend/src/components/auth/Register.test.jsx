import { fireEvent, render, screen } from '@testing-library/react';
import '../../i18n';
import Register from './Register';
import { registerUser } from '../../utils/api';

vi.mock('../../utils/api', () => ({ registerUser: vi.fn(), loginUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));

it.each([false, true])('blocks a six-character new password before registration (first run: %s)', (isFirstRun) => {
  registerUser.mockClear();
  const { container } = render(<Register isFirstRun={isFirstRun} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.invalid' } });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'Aa1!xx' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Aa1!xx' } });
  fireEvent.submit(container.querySelector('form'));
  expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/);
  expect(registerUser).not.toHaveBeenCalled();
});

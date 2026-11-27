import { fireEvent, render, screen } from '@testing-library/react';
import '../../i18n';
import Register from './Register';
import Login from './Login';
import { registerUser } from '../../utils/api';

vi.mock('../../utils/api', () => ({ registerUser: vi.fn(), loginUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));

it.each([Login, Register])('uses the shared required-field cues in %s', (Form) => {
  render(<Form isFirstRun onClose={vi.fn()} />);
  expect(screen.getByLabelText('Email')).toHaveAttribute('aria-required', 'true');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('aria-required', 'true');
  expect(document.querySelector('.form-legend')).toBeInTheDocument();
  const code = screen.queryByRole('textbox', { name: /Setup code/ }) || document.querySelector('#setup-secret');
  if (code) {
    expect(code).not.toHaveAttribute('aria-required', 'true');
    expect(code.labels[0]).not.toHaveTextContent('(optional)');
    expect(code).toHaveAccessibleDescription(/Leave blank for this computer/);
  }
});

it.each([false, true])('blocks a six-character new password before registration (first run: %s)', (isFirstRun) => {
  registerUser.mockClear();
  render(<Register isFirstRun={isFirstRun} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.invalid' } });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'Aa1!xx' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Aa1!xx' } });
  fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
  expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/);
  expect(registerUser).not.toHaveBeenCalled();
});

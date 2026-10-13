import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../i18n';
import SolverStatus from './SolverStatus';
import { solverStatus } from '../runtime/solverStatus';
import { cancelSolver } from '../runtime/solver';

vi.mock('../runtime/solver', () => ({ cancelSolver: vi.fn() }));

afterEach(() => act(() => { while (solverStatus.get().active) solverStatus.finish(); }));

it('shows nothing while the solver is idle', () => {
  const { container } = render(<SolverStatus />);
  expect(container).toBeEmptyDOMElement();
});

it('says the engine is loading on the first call', () => {
  render(<SolverStatus />);
  act(() => { solverStatus.start(); solverStatus.progress('loading-runtime'); });
  expect(screen.getByRole('status')).toHaveTextContent(/Loading the calculation engine/);
});

it('says model support is loading on the first model import', () => {
  render(<SolverStatus />);
  act(() => { solverStatus.start(); solverStatus.progress('loading-model-packages'); });
  expect(screen.getByRole('status')).toHaveTextContent(/Loading 3D model support/);
});

it('shows elapsed seconds while calculating and cancels on request', async () => {
  render(<SolverStatus />);
  act(() => { solverStatus.start(); solverStatus.progress('solving', { elapsedMs: 4200 }); });
  expect(screen.getByRole('status')).toHaveTextContent('Calculating… 4 s');

  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancelSolver).toHaveBeenCalled();
});

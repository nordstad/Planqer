import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../i18n';
import ProjectPicker from './ProjectPicker';
import { useProjectChoice } from '../hooks/useProjectChoice';
import { createProjectGroup } from '../utils/api';

vi.mock('../utils/api', () => ({ createProjectGroup: vi.fn() }));

const Choice = () => {
  const choice = useProjectChoice({ groups: [], fallbackName: 'Bench', onCreated: () => {} });
  return <><ProjectPicker groups={[]} value={choice.groupId} onChange={choice.setGroupId} newName={choice.newName} onNewNameChange={choice.setNewName} fallbackName="Bench" /><button onClick={choice.resolve}>Save</button></>;
};

it.each(['', '   '])('explains and applies the optional blank-name fallback: %j', async (name) => {
  localStorage.clear();
  createProjectGroup.mockResolvedValue({ id: 'synthetic', name: 'Bench' });
  const user = userEvent.setup();
  render(<Choice />);
  const input = screen.getByRole('textbox', { name: /New project name/ });
  expect(input).not.toHaveAttribute('aria-required', 'true');
  expect(input).toHaveAccessibleDescription('Leave blank to use “Bench” as the project name.');
  await user.clear(input);
  if (name) await user.type(input, name);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(createProjectGroup).toHaveBeenCalledWith('Bench');
});

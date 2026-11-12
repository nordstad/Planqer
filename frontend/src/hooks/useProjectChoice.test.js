import { act, renderHook } from '@testing-library/react';
import '../i18n';
import { NEW_PROJECT } from '../components/ProjectPicker';
import { createProjectGroup } from '../utils/api';
import { useProjectChoice } from './useProjectChoice';

vi.mock('../utils/api', () => ({ createProjectGroup: vi.fn() }));

const shed = { id: 'g1', name: 'Shed' };
const bench = { id: 'g2', name: 'Bench' };

const setup = (groups, fallbackName = '') => {
  const onCreated = vi.fn();
  const hook = renderHook((props) => useProjectChoice({ groups: props.groups, onCreated, fallbackName }), {
    initialProps: { groups },
  });
  return { ...hook, onCreated };
};

beforeEach(() => {
  localStorage.clear();
  createProjectGroup.mockReset();
  createProjectGroup.mockImplementation(async (name) => ({ id: 'new', name }));
});

describe('useProjectChoice', () => {
  it('offers a new project called "My plans" when there are no projects yet', () => {
    const { result } = setup([]);
    expect(result.current.groupId).toBe(NEW_PROJECT);
    expect(result.current.newName).toBe('My plans');
  });

  it('defaults to the first project, then follows groups as they load', () => {
    const { result, rerender } = setup([]);
    rerender({ groups: [shed, bench] });
    expect(result.current.groupId).toBe('g1');
    expect(result.current.newName).toBe('');
  });

  it('defaults to the last project used', async () => {
    const first = setup([shed, bench]);
    act(() => first.result.current.setGroupId('g2'));
    await act(() => first.result.current.resolve());

    const next = setup([shed, bench]);
    expect(next.result.current.groupId).toBe('g2');
  });

  it('creates the typed project when resolving, and files under it', async () => {
    const { result, onCreated } = setup([shed]);
    act(() => { result.current.setGroupId(NEW_PROJECT); result.current.setNewName('Garden'); });

    let id;
    await act(async () => { id = await result.current.resolve(); });

    expect(createProjectGroup).toHaveBeenCalledWith('Garden');
    expect(onCreated).toHaveBeenCalledWith({ id: 'new', name: 'Garden' });
    expect(id).toBe('new');
  });

  it('falls back to the plan name when the new project has no name', async () => {
    const { result } = setup([shed], 'Dining chair');
    act(() => result.current.setGroupId(NEW_PROJECT));

    await act(async () => { await result.current.resolve(); });

    expect(createProjectGroup).toHaveBeenCalledWith('Dining chair');
  });

  it('reuses an existing project of the same name instead of creating a duplicate', async () => {
    const { result, onCreated } = setup([shed, bench]);
    act(() => { result.current.setGroupId(NEW_PROJECT); result.current.setNewName(' bench '); });

    let id;
    await act(async () => { id = await result.current.resolve(); });

    expect(createProjectGroup).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(id).toBe('g2');
  });

  it('creates nothing and rejects when the project cannot be made', async () => {
    createProjectGroup.mockRejectedValue(new Error('rate limited'));
    const { result } = setup([]);
    await expect(act(() => result.current.resolve())).rejects.toThrow('Could not create that project: rate limited');
  });
});

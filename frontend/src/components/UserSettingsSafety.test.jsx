import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import UserSettings from './UserSettings';
import { AuthContext } from '../contexts/AuthContext';
import { getUserSettings, updateUserSettings } from '../utils/api';
import { setCatalogueChoice } from '../utils/catalogueChoice';
import { LOCAL_DATA_RESTORED } from '../hooks/useLocalDataRevision';

const language = vi.hoisted(() => ({ language: 'en-GB', changeLanguage: vi.fn() }));
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => language }));
vi.mock('../utils/api', () => ({ getUserSettings: vi.fn(), updateUserSettings: vi.fn() }));
vi.mock('../utils/catalogueChoice', async (original) => ({ ...(await original()), setCatalogueChoice: vi.fn() }));

const defaults = {
  default_board_lengths: [4200, 5400], default_saw_blade_width: 4,
  default_currency: 'EUR', default_vat_rate: 20, default_prices_include_vat: false,
  preferred_language: 'en-GB', spare_margin_percent: 5, catalogue_country: 'NO',
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const setup = (initialUser = { id: 'A' }) => {
  const loads = [];
  getUserSettings.mockImplementation(() => {
    const request = deferred();
    loads.push(request);
    return request.promise;
  });
  const tree = (user) => <AuthContext.Provider value={{ user }}><UserSettings /></AuthContext.Provider>;
  const view = render(tree(initialUser));
  return { ...view, loads, changeUser: (user) => view.rerender(tree(user)) };
};
const finishLoad = async (request, { failure = false, data = defaults } = {}) => act(async () => {
  if (failure) request.reject(new Error('Synthetic load failed'));
  else request.resolve(data);
});
const submit = () => fireEvent.submit(screen.getByLabelText('Default board lengths, mm').closest('form'));
const expectLocked = () => {
  expect(screen.queryByLabelText('Default board lengths, mm')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
};
const expectDefaults = (lengths = '4200, 5400') => {
  expect(screen.getByLabelText('Default board lengths, mm')).toHaveValue(lengths);
  expect(screen.getByLabelText('Default cut width (kerf), mm')).toHaveValue(4);
  expect(screen.getByLabelText('Default currency')).toHaveValue('EUR');
  expect(screen.getByLabelText('VAT rate, %')).toHaveValue(20);
  expect(screen.getByLabelText('Prices include VAT')).not.toBeChecked();
  expect(screen.getByLabelText('Default spare margin, %')).toHaveValue(5);
  expect(screen.getByLabelText('Product catalogue')).toHaveValue('NO');
};

beforeEach(() => {
  vi.clearAllMocks();
  updateUserSettings.mockResolvedValue({});
  language.changeLanguage.mockResolvedValue();
});

describe('Defaults load/save safety', () => {
  it('reloads a mounted form after restore and ignores a superseded pending load', async () => {
    const state = setup();
    await finishLoad(state.loads[0]);
    fireEvent.change(screen.getByLabelText('Default board lengths, mm'), { target: { value: '6000' } });
    act(() => window.dispatchEvent(new Event(LOCAL_DATA_RESTORED)));
    expectLocked();
    act(() => window.dispatchEvent(new Event(LOCAL_DATA_RESTORED)));
    await finishLoad(state.loads[2], { data: { ...defaults, default_board_lengths: [7200] } });
    await finishLoad(state.loads[1]);
    expectDefaults('7200');
    expect(updateUserSettings).not.toHaveBeenCalled();
  });

  it('does not expose editable defaults or Save while the initial read is pending', () => {
    setup();
    expectLocked();
    expect(screen.getByRole('status', { name: 'Working' })).toBeInTheDocument();
    expect(updateUserSettings).not.toHaveBeenCalled();
  });

  it('does not read or save settings without a current user', () => {
    setup(null);
    expectLocked();
    expect(getUserSettings).not.toHaveBeenCalled();
    expect(updateUserSettings).not.toHaveBeenCalled();
  });

  it('blocks a replacement save after a failed initial read, including direct submit', async () => {
    const state = setup();
    await finishLoad(state.loads[0], { failure: true });
    const form = state.container.querySelector('form');
    if (form) await act(async () => fireEvent.submit(form));
    expect(updateUserSettings).not.toHaveBeenCalled();
    expect(language.changeLanguage).not.toHaveBeenCalled();
    expect(setCatalogueChoice).not.toHaveBeenCalled();
    expectLocked();
    expect(screen.getByRole('alert')).toHaveTextContent('Synthetic load failed');
    expect(screen.getByRole('button', { name: 'Retry loading settings' })).toBeEnabled();
  });

  it('retries without saving fallbacks and enables saving only the recovered values', async () => {
    const state = setup();
    await finishLoad(state.loads[0], { failure: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading settings' }));
    expectLocked();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(updateUserSettings).not.toHaveBeenCalled();
    await finishLoad(state.loads[1]);
    expectDefaults();
    submit();
    await waitFor(() => expect(updateUserSettings).toHaveBeenCalledWith(defaults));
    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
  });

  it('stays locked after a failed retry and permits another load attempt', async () => {
    const state = setup();
    await finishLoad(state.loads[0], { failure: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading settings' }));
    await finishLoad(state.loads[1], { failure: true });
    expectLocked();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading settings' }));
    await finishLoad(state.loads[2]);
    expectDefaults();
    expect(updateUserSettings).not.toHaveBeenCalled();
  });

  it('keeps the loaded draft editable after save failure and retries its exact values', async () => {
    const state = setup();
    await finishLoad(state.loads[0]);
    fireEvent.change(screen.getByLabelText('Default board lengths, mm'), { target: { value: '4800, 6000' } });
    updateUserSettings.mockRejectedValueOnce(new Error('Synthetic save failed'));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic save failed');
    expectDefaults('4800, 6000');
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled();
    expect(language.changeLanguage).not.toHaveBeenCalled();
    expect(setCatalogueChoice).not.toHaveBeenCalled();
    submit();
    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    expect(updateUserSettings).toHaveBeenLastCalledWith({ ...defaults, default_board_lengths: [4800, 6000] });
  });

  it('applies current successful settings only after the save completes', async () => {
    const state = setup();
    const save = deferred();
    updateUserSettings.mockReturnValue(save.promise);
    await finishLoad(state.loads[0]);
    submit();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(language.changeLanguage).not.toHaveBeenCalled();
    expect(setCatalogueChoice).not.toHaveBeenCalled();
    await act(async () => save.resolve({}));
    expect(language.changeLanguage).toHaveBeenCalledWith('en-GB', { persistAccount: false });
    expect(setCatalogueChoice).toHaveBeenCalledWith('NO');
    expect(screen.getByText('Settings saved')).toBeInTheDocument();
  });

  it('rejects duplicate direct submissions while a save is pending', async () => {
    const state = setup();
    updateUserSettings.mockReturnValue(deferred().promise);
    await finishLoad(state.loads[0]);
    act(() => { submit(); submit(); });
    expect(updateUserSettings).toHaveBeenCalledTimes(1);
  });

  it('does not reload an edited draft for a refreshed user object with the same ID', async () => {
    const state = setup();
    await finishLoad(state.loads[0]);
    fireEvent.change(screen.getByLabelText('Default board lengths, mm'), { target: { value: '4800' } });
    state.changeUser({ id: 'A', email: 'new@example.invalid' });
    expect(state.loads).toHaveLength(1);
    expect(screen.getByLabelText('Default board lengths, mm')).toHaveValue('4800');
  });

  for (const order of ['old-first', 'new-first']) {
    for (const failure of [false, true]) {
      it(`ignores obsolete user loads: ${order}, ${failure ? 'failure' : 'success'}`, async () => {
        const state = setup();
        state.changeUser({ id: 'B' });
        if (order === 'old-first') {
          await finishLoad(state.loads[0], { failure });
          expectLocked();
          await finishLoad(state.loads[1], { data: { ...defaults, default_board_lengths: [7200] } });
        } else {
          await finishLoad(state.loads[1], { data: { ...defaults, default_board_lengths: [7200] } });
          await finishLoad(state.loads[0], { failure });
        }
        expectDefaults('7200');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    }
  }

  it('retires completed settings and actions when the current user changes', async () => {
    const state = setup();
    await finishLoad(state.loads[0]);
    state.changeUser({ id: 'B' });
    expectLocked();
    expect(updateUserSettings).not.toHaveBeenCalled();
    await finishLoad(state.loads[1]);
    expectDefaults();
  });

  it('does not revive an earlier same-user request after A→B→A', async () => {
    const state = setup();
    state.changeUser({ id: 'B' });
    state.changeUser({ id: 'A' });
    await finishLoad(state.loads[0]);
    expectLocked();
    await finishLoad(state.loads[2], { data: { ...defaults, default_board_lengths: [7200] } });
    await finishLoad(state.loads[1]);
    expectDefaults('7200');
  });

  for (const failure of [false, true]) {
    it(`ignores obsolete save ${failure ? 'failure' : 'success'} while a new user's save is pending`, async () => {
      const state = setup();
      const oldSave = deferred();
      const newSave = deferred();
      updateUserSettings.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(newSave.promise);
      await finishLoad(state.loads[0]);
      submit();
      state.changeUser({ id: 'B' });
      await finishLoad(state.loads[1]);
      submit();
      await act(async () => {
        if (failure) oldSave.reject(new Error('Obsolete save failed'));
        else oldSave.resolve({});
      });
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText('Settings saved')).not.toBeInTheDocument();
      expect(language.changeLanguage).not.toHaveBeenCalled();
      expect(setCatalogueChoice).not.toHaveBeenCalled();
      await act(async () => newSave.resolve({}));
      expect(language.changeLanguage).toHaveBeenCalledTimes(1);
      expect(setCatalogueChoice).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });

    it(`ignores save ${failure ? 'failure' : 'success'} after unmount`, async () => {
      const state = setup();
      const save = deferred();
      updateUserSettings.mockReturnValue(save.promise);
      await finishLoad(state.loads[0]);
      submit();
      state.unmount();
      await act(async () => {
        if (failure) save.reject(new Error('Obsolete save failed'));
        else save.resolve({});
      });
      expect(language.changeLanguage).not.toHaveBeenCalled();
      expect(setCatalogueChoice).not.toHaveBeenCalled();
    });
  }
});

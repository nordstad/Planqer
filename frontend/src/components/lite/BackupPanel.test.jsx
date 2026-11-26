import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n';
import BackupPanel from './BackupPanel';
import { backupExport, backupImport, backupPreview, hasSavedWork } from '../../runtime/localBackend';
import { getStorageStatus, requestPersistence } from '../../runtime/dataSafety';
import { track } from '../../utils/analytics';

vi.mock('../../utils/analytics', () => ({ track: vi.fn() }));

vi.mock('../../runtime/localBackend', () => ({
  backupExport: vi.fn(),
  backupImport: vi.fn(),
  backupPreview: vi.fn(),
  hasSavedWork: vi.fn(),
}));
vi.mock('../../runtime/dataSafety', async (importOriginal) => ({
  ...(await importOriginal()),
  getStorageStatus: vi.fn(),
  requestPersistence: vi.fn(),
}));

let click;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  hasSavedWork.mockResolvedValue(true);
  getStorageStatus.mockResolvedValue({ supported: true, persisted: false, usageBytes: 3_000_000, quotaBytes: 1e9 });
  backupExport.mockResolvedValue({ app: 'partsible-lite', format: 1, stores: {} });
  backupPreview.mockReset().mockResolvedValue({
    additions: 1, replacements: 0,
    stores: { projects: [{ id: 'p1', name: 'Shelf', currentName: null, action: 'add' }] },
  });
  backupImport.mockReset().mockResolvedValue({ projects: 1 });
  URL.createObjectURL = vi.fn(() => 'blob:backup');
  URL.revokeObjectURL = vi.fn();
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => click.mockRestore());

const renderPanel = async () => {
  render(<BackupPanel />);
  await screen.findByText(/Storage:/);
};

it('reminds someone with saved work and no backup', async () => {
  await renderPanel();
  expect(screen.getByRole('note')).toHaveTextContent(/no recent backup/i);
  expect(screen.getByText(/not exported a backup yet/i)).toBeInTheDocument();
});

it('has nothing to remind about when nothing is saved', async () => {
  hasSavedWork.mockResolvedValue(false);
  await renderPanel();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

it('downloads a dated backup file and records the export', async () => {
  await renderPanel();
  await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));

  await waitFor(() => expect(click).toHaveBeenCalled());
  expect(screen.getByText('Backup saved to your downloads.')).toBeInTheDocument();
  expect(localStorage.getItem('partsible.lite.lastExported')).not.toBeNull();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup');
});

it('says so when the backup cannot be made', async () => {
  backupExport.mockRejectedValue(new Error('disk'));
  await renderPanel();
  await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
  expect(await screen.findByText('Could not create the backup.')).toBeInTheDocument();
  expect(localStorage.getItem('partsible.lite.lastExported')).toBeNull();
});

describe('import', () => {
  const choose = (content) => {
    const input = document.querySelector('input[type="file"]');
    const file = new File([content], 'backup.json', { type: 'application/json' });
    return userEvent.upload(input, file);
  };

  it('previews without writing, then restores only after the user acts', async () => {
    backupImport.mockResolvedValue({ projects: 2, sheet_projects: 1, tile_projects: 0, groups: 2, settings: 1 });
    await renderPanel();
    await choose('{"app":"partsible-lite"}');
    await screen.findByRole('heading', { name: 'Review backup restore' });
    expect(backupImport).not.toHaveBeenCalled();
    expect(backupPreview).toHaveBeenCalledWith('{"app":"partsible-lite"}');
    await userEvent.click(screen.getByRole('button', { name: 'Restore backup', exact: true }));
    expect(await screen.findByText('Restored 3 plans and 2 projects.')).toBeInTheDocument();
    expect(backupImport).toHaveBeenCalledWith(await backupPreview.mock.results[0].value, { replaceExisting: false });
  });

  it.each([
    ['notBackup', /not a Partsible Lite backup/],
    ['tooNew', /newer version/],
    ['invalid', /invalid or unsupported saved data/],
  ])('explains a %s file in words', async (code, message) => {
    backupPreview.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'BackupError', code }));
    await renderPanel();
    await choose('whatever');
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('does not show an unexpected error as raw text', async () => {
    backupPreview.mockRejectedValueOnce(new Error('IDBDatabase exploded'));
    await renderPanel();
    await choose('{}');
    expect(await screen.findByText('Could not import the backup.')).toBeInTheDocument();
    expect(screen.queryByText(/exploded/)).not.toBeInTheDocument();
  });

  it('requires explicit approval for every matching-ID replacement, including Defaults and catalogue entries', async () => {
    backupPreview.mockResolvedValueOnce({
      additions: 0, replacements: 2,
      stores: {
        settings: [{ id: 'settings', name: 'settings', currentName: 'settings', action: 'replace' }],
        catalogue_entries: [{ id: 'product', name: 'product', currentName: 'product', action: 'replace' }],
      },
    });
    await renderPanel();
    await choose('{}');
    const restore = await screen.findByRole('button', { name: 'Replace and restore' });
    expect(restore).toBeDisabled();
    expect(screen.getByText(/Defaults — add 0, replace 1/)).toBeInTheDocument();
    expect(screen.getByText(/Catalogue entries — add 0, replace 1/)).toBeInTheDocument();
    expect(backupImport).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('checkbox', { name: /agree to replace/ }));
    await userEvent.click(restore);
    await waitFor(() => expect(backupImport).toHaveBeenCalledWith(expect.any(Object), { replaceExisting: true }));
  });

  it('cancels a ready preview without writing', async () => {
    await renderPanel();
    await choose('{}');
    await screen.findByRole('heading', { name: 'Review backup restore' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByRole('button', { name: 'Restore backup', exact: true })).not.toBeInTheDocument();
    expect(backupImport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Import backup', exact: true })).toHaveFocus();
  });

  it('retires stale previews and requires a new preview and new replacement approval', async () => {
    const replacement = { additions: 0, replacements: 1, stores: { projects: [
      { id: 'p1', name: 'New', currentName: 'Old', action: 'replace' },
    ] } };
    backupPreview.mockResolvedValue(replacement);
    backupImport.mockRejectedValueOnce(Object.assign(new Error(), { name: 'BackupError', code: 'stale' }));
    await renderPanel();
    await choose('{}');
    await screen.findByRole('heading', { name: 'Review backup restore' });
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Replace and restore' }));
    expect(await screen.findByText(/Saved work changed after this preview/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Preview again' }));
    await screen.findByRole('heading', { name: 'Review backup restore' });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Replace and restore' })).toBeDisabled();
    expect(backupImport).toHaveBeenCalledTimes(1);
  });

  it('keeps an empty backup read-only', async () => {
    backupPreview.mockResolvedValueOnce({ additions: 0, replacements: 0, stores: {} });
    await renderPanel();
    await choose('{}');
    expect(await screen.findByText('This backup contains no records to restore.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore backup', exact: true })).toBeDisabled();
    expect(backupImport).not.toHaveBeenCalled();
  });

  it('ignores a cancelled pending preview and its late failure', async () => {
    let reject;
    backupPreview.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    await renderPanel();
    await choose('{}');
    await screen.findByText('Checking backup…');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    await act(async () => { reject(new Error('old preview')); });
    expect(screen.queryByRole('heading', { name: 'Review backup restore' })).not.toBeInTheDocument();
    expect(screen.queryByText('Could not import the backup.')).not.toBeInTheDocument();
    expect(backupImport).not.toHaveBeenCalled();
  });

  it('does not allow another restore, file selection, or cancellation during commit', async () => {
    let finish;
    backupImport.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await renderPanel();
    await choose('{}');
    await screen.findByRole('heading', { name: 'Review backup restore' });
    await userEvent.dblClick(screen.getByRole('button', { name: 'Restore backup', exact: true }));
    expect(backupImport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Import backup', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    expect(screen.queryByText(/Restored 1/)).not.toBeInTheDocument();
    await act(async () => { finish({ projects: 1 }); });
    expect(await screen.findByText('Restored 1 plans and 0 projects.')).toBeInTheDocument();
  });

  it.each(['success', 'failure'])('ignores a superseded file preview completing with %s', async (outcome) => {
    let resolve;
    let reject;
    backupPreview.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
    await renderPanel();
    await choose('old file');
    await screen.findByText('Checking backup…');
    await choose('current file');
    await screen.findByRole('heading', { name: 'Review backup restore' });
    await act(async () => {
      if (outcome === 'failure') reject(new Error('old file failed'));
      else resolve({ additions: 0, replacements: 1, stores: { groups: [{ id: 'old', name: 'Obsolete', action: 'replace' }] } });
    });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Could not import the backup.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore backup', exact: true }));
    expect(backupImport).toHaveBeenCalledWith(await backupPreview.mock.results[1].value, { replaceExisting: false });
  });

  it('does not restore an abandoned preview after leaving and reopening the panel', async () => {
    let resolve;
    backupPreview.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = render(<BackupPanel />);
    await screen.findByText(/Storage:/);
    await choose('{}');
    await screen.findByText('Checking backup…');
    view.unmount();
    await renderPanel();
    await act(async () => { resolve({ additions: 1, replacements: 0, stores: {} }); });
    expect(screen.queryByRole('heading', { name: 'Review backup restore' })).not.toBeInTheDocument();
    expect(backupImport).not.toHaveBeenCalled();
  });

  it('requires a new preview after a failed write rather than reusing its approval', async () => {
    backupImport.mockRejectedValueOnce(new DOMException('Injected failure', 'QuotaExceededError'));
    await renderPanel();
    await choose('{}');
    await screen.findByRole('heading', { name: 'Review backup restore' });
    await userEvent.click(screen.getByRole('button', { name: 'Restore backup', exact: true }));
    await screen.findByText('Could not import the backup.');
    expect(screen.queryByRole('button', { name: 'Restore backup', exact: true })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Preview again' }));
    await screen.findByRole('heading', { name: 'Review backup restore' });
    expect(backupPreview).toHaveBeenCalledTimes(2);
    expect(backupImport).toHaveBeenCalledTimes(1);
  });

  it('rereads the file before restoring and refuses changed contents', async () => {
    await renderPanel();
    const file = new File(['old contents'], 'backup.json', { type: 'application/json' });
    file.text = vi.fn().mockResolvedValueOnce('old contents').mockResolvedValueOnce('changed on disk');
    await userEvent.upload(document.querySelector('input[type="file"]'), file);
    await screen.findByRole('heading', { name: 'Review backup restore' });
    await userEvent.click(screen.getByRole('button', { name: 'Restore backup', exact: true }));
    expect(await screen.findByText(/The backup file changed after this preview/)).toBeInTheDocument();
    expect(backupImport).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Review backup restore' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview again' })).toBeInTheDocument();
  });
});

describe('storage', () => {
  it('offers to ask for protection and reports the answer', async () => {
    requestPersistence.mockResolvedValue(true);
    await renderPanel();
    expect(screen.getByText(/may clear this data/i)).toBeInTheDocument();
    getStorageStatus.mockResolvedValue({ supported: true, persisted: true, usageBytes: null, quotaBytes: null });
    await userEvent.click(screen.getByRole('button', { name: 'Ask the browser to keep my data' }));
    expect(await screen.findByText(/agreed to keep this data/i)).toBeInTheDocument();
  });

  it('says a refusal plainly and points to the backup', async () => {
    requestPersistence.mockResolvedValue(false);
    await renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Ask the browser to keep my data' }));
    expect(await screen.findByText(/did not agree/i)).toBeInTheDocument();
  });

  it('does not offer to ask when the data is already protected', async () => {
    getStorageStatus.mockResolvedValue({ supported: true, persisted: true, usageBytes: null, quotaBytes: null });
    await renderPanel();
    expect(screen.getByText(/agreed to keep this data/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ask the browser/ })).not.toBeInTheDocument();
  });

  it('is honest when the browser cannot say', async () => {
    getStorageStatus.mockResolvedValue({ supported: false, persisted: false, usageBytes: null, quotaBytes: null });
    await renderPanel();
    expect(screen.getByText(/cannot tell whether/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ask the browser/ })).not.toBeInTheDocument();
  });
});

it('counts an export, and only a successful one', async () => {
  await renderPanel();
  await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
  await screen.findByText(/Backup saved/);
  expect(track).toHaveBeenCalledWith('project_exported');

  track.mockClear();
  backupExport.mockRejectedValue(new Error('no'));
  await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
  await screen.findByText(/Could not create/);
  expect(track).not.toHaveBeenCalled();
});

it('keeps the import file input rendered, so Import backup works on iOS Safari', async () => {
  await renderPanel();
  const input = document.querySelector('input[type="file"]');
  expect(input).not.toHaveAttribute('hidden');
  expect(input.style.display).not.toBe('none');
});

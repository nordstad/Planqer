import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n';
import BackupPanel from './BackupPanel';
import { backupExport, backupImport, hasSavedWork } from '../../runtime/localBackend';
import { getStorageStatus, requestPersistence } from '../../runtime/dataSafety';

vi.mock('../../runtime/localBackend', () => ({
  backupExport: vi.fn(),
  backupImport: vi.fn(),
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
  backupExport.mockResolvedValue({ app: 'planqer-demo', format: 1, stores: {} });
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
  expect(localStorage.getItem('planqer.demo.lastExported')).not.toBeNull();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup');
});

it('says so when the backup cannot be made', async () => {
  backupExport.mockRejectedValue(new Error('disk'));
  await renderPanel();
  await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
  expect(await screen.findByText('Could not create the backup.')).toBeInTheDocument();
  expect(localStorage.getItem('planqer.demo.lastExported')).toBeNull();
});

describe('import', () => {
  const choose = (content) => {
    const input = document.querySelector('input[type="file"]');
    const file = new File([content], 'backup.json', { type: 'application/json' });
    return userEvent.upload(input, file);
  };

  it('restores a file and says what came back', async () => {
    backupImport.mockResolvedValue({ projects: 2, sheet_projects: 1, tile_projects: 0, groups: 2, settings: 1 });
    await renderPanel();
    await choose('{"app":"planqer-demo"}');
    expect(await screen.findByText('Restored 3 plans and 2 projects.')).toBeInTheDocument();
    expect(backupImport).toHaveBeenCalledWith('{"app":"planqer-demo"}');
  });

  it.each([
    ['notBackup', /not a Planqer demo backup/],
    ['tooNew', /newer version/],
    ['invalid', /damaged/],
  ])('explains a %s file in words', async (code, message) => {
    backupImport.mockRejectedValue(Object.assign(new Error('x'), { name: 'BackupError', code }));
    await renderPanel();
    await choose('whatever');
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('does not show an unexpected error as raw text', async () => {
    backupImport.mockRejectedValue(new Error('IDBDatabase exploded'));
    await renderPanel();
    await choose('{}');
    expect(await screen.findByText('Could not import the backup.')).toBeInTheDocument();
    expect(screen.queryByText(/exploded/)).not.toBeInTheDocument();
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

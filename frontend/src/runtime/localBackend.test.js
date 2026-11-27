import { backupImport } from './localBackend';
import { importBackup } from './backup';
import { resetCatalogueCache } from '../utils/catalogue';

vi.mock('./backup', () => ({ importBackup: vi.fn(), exportBackup: vi.fn(), previewBackup: vi.fn() }));
vi.mock('./indexedDb', () => ({ openDatabase: vi.fn().mockResolvedValue({}) }));
vi.mock('./localApi', () => ({ createLocalApi: vi.fn() }));
vi.mock('./solver', () => ({ solverCall: vi.fn() }));
vi.mock('../utils/catalogue', () => ({ resetCatalogueCache: vi.fn() }));

it('invalidates mounted consumers and catalogue caches only after a successful commit', async () => {
  const listener = vi.fn();
  window.addEventListener('partsible:local-data-restored', listener);
  try {
    let commit;
    importBackup.mockImplementationOnce(() => new Promise((resolve) => { commit = resolve; }));
    const pending = backupImport({}, {});
    await vi.waitFor(() => expect(importBackup).toHaveBeenCalled());
    expect(listener).not.toHaveBeenCalled();
    commit({ groups: 1 });
    await expect(pending).resolves.toEqual({ groups: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(resetCatalogueCache).toHaveBeenCalledTimes(1);
    importBackup.mockRejectedValueOnce(new Error('Rolled back'));
    await expect(backupImport({}, {})).rejects.toThrow('Rolled back');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(resetCatalogueCache).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('partsible:local-data-restored', listener); }
});

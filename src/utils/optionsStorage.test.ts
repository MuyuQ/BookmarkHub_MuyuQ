import { beforeEach, describe, expect, it, vi } from 'vitest';

const onChangedListeners: Array<(newOptions: Record<string, unknown>, oldOptions: Record<string, unknown>) => void> = [];

class MockOptionsSync {
  static migrations = {
    removeUnused: Symbol('removeUnused'),
  };

  private store: Record<string, unknown>;

  constructor(config: { defaults: Record<string, unknown> }) {
    this.store = structuredClone(config.defaults);
  }

  async getAll(): Promise<Record<string, unknown>> {
    return structuredClone(this.store);
  }

  async set(values: Record<string, unknown>): Promise<void> {
    const previous = structuredClone(this.store);
    this.store = {
      ...this.store,
      ...values,
    };
    for (const listener of onChangedListeners) {
      listener(structuredClone(this.store), previous);
    }
  }

  onChanged(listener: (newOptions: Record<string, unknown>, oldOptions: Record<string, unknown>) => void): void {
    onChangedListeners.push(listener);
  }
}

vi.mock('webext-options-sync', () => ({
  default: MockOptionsSync,
}));

describe('optionsStorage', () => {
  beforeEach(() => {
    vi.resetModules();
    onChangedListeners.length = 0;
    vi.stubGlobal('browser', {
      runtime: {
        id: 'bookmarkhub-test-extension-id',
      },
    });
  });

  it('decrypts credentials with the stored master password while keeping the stored value non-plain', async () => {
    const { default: optionsStorage, getAllDecrypted, setEncrypted } = await import('./optionsStorage');

    await setEncrypted({
      githubToken: 'token-123',
      gistID: 'gist-id',
      gistFileName: 'BookmarkHub',
      webdavPassword: 'dav-secret',
      masterPassword: 'MasterPassword-123!',
    });

    const rawOptions = await optionsStorage.getAll();
    const decryptedOptions = await getAllDecrypted();

    expect(rawOptions.masterPassword).not.toBe('MasterPassword-123!');
    expect(decryptedOptions.masterPassword).toBe('MasterPassword-123!');
    expect(decryptedOptions.githubToken).toBe('token-123');
    expect(decryptedOptions.webdavPassword).toBe('dav-secret');
  });

  it('keeps newly supplied sensitive values instead of restoring old encrypted values on save', async () => {
    const { getAllDecrypted, setEncrypted } = await import('./optionsStorage');

    await setEncrypted({
      githubToken: 'old-token',
      gistID: 'gist-id',
      gistFileName: 'BookmarkHub',
      webdavPassword: 'old-password',
      masterPassword: 'MasterPassword-123!',
    });

    await setEncrypted({
      githubToken: 'new-token',
      gistID: 'gist-id',
      gistFileName: 'BookmarkHub',
      webdavPassword: 'new-password',
      masterPassword: 'MasterPassword-123!',
    });

    const decryptedOptions = await getAllDecrypted();

    expect(decryptedOptions.githubToken).toBe('new-token');
    expect(decryptedOptions.webdavPassword).toBe('new-password');
  });
});

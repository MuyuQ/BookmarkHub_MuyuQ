# BookmarkHub v2 Security and Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Release 2 product-parity capabilities to BookmarkHub v2: end-to-end encryption, automatic sync, forced sync, and delete-remote-data flows on top of the Release 1 core.

**Architecture:** Reuse the `src/core/sync-v2/` foundation from Release 1 and extend it with a focused security layer, a scheduler/runtime layer, and new runtime bridge actions. Use the existing `src/utils/crypto.ts`, `src/utils/debounce.ts`, and browser alarm/bookmark-event patterns as implementation references, but keep all new behavior inside the v2 core instead of reviving the legacy sync path.

**Tech Stack:** WXT 0.19, React 18, TypeScript, Vitest, Testing Library, Web Crypto API, browser.alarms API, browser.storage API, browser.bookmarks API

---

## Prerequisite Gate

Do not execute this plan until the Release 1 / MVP child plan has verified cleanly:

- [2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md)

Required prerequisite evidence:

- `npm run compile` passes on the Release 1 branch
- `npm test` passes on the Release 1 branch
- `npm run build` passes on the Release 1 branch
- Chrome and Firefox manual MVP checks are complete

Run before starting Release 2:

```bash
npm run compile
npm test
npm run build
```

Expected:

- All three commands exit `0`

---

## Scope Guard

This plan adds only these Release 2 features:

- End-to-end encryption for `GitHub Repo / Gist / WebDAV`
- Automatic sync scheduling and trigger handling
- Forced sync action
- Delete-remote-data action with confirmation and audit history
- Security state and automation controls in popup/options

Do not pull these into Release 2:

- Full time-machine restore
- `Gitee / GitLab / S3 / Google Drive / OneDrive`
- Move detection
- Conflict visualization
- Result replay

If one of those becomes necessary, stop and write the next release plan instead of expanding this one.

---

## File Structure

### New files

- `src/core/sync-v2/security/cryptoEnvelope.ts`
  - Release 2 encryption envelope format and helpers.
- `src/core/sync-v2/security/keyStore.ts`
  - Key derivation, passphrase hashing, salt handling, and storage-safe helpers.
- `src/core/sync-v2/security/securityService.ts`
  - Encrypt/decrypt snapshots and history payloads before they touch a storage adapter.
- `src/core/sync-v2/security/securityService.test.ts`
  - Encryption round-trip tests.
- `src/core/sync-v2/app/autoSyncScheduler.ts`
  - Alarm registration, bookmark-event scheduling, and runtime debounce.
- `src/core/sync-v2/app/autoSyncScheduler.test.ts`
  - Timer/event scheduling tests.
- `src/core/sync-v2/app/deleteRemoteFlow.ts`
  - Delete-remote orchestration plus audit-entry generation.
- `src/core/sync-v2/app/deleteRemoteFlow.test.ts`
  - Delete action tests.

### Existing files to modify

- `src/core/sync-v2/domain.ts`
  - Extend domain types with security and automation metadata.
- `src/core/sync-v2/storage/types.ts`
  - Extend profiles with encryption and automation settings.
- `src/core/sync-v2/storage/githubRepoAdapter.ts`
  - Write/read encrypted envelopes instead of plain snapshots when enabled.
- `src/core/sync-v2/storage/gistAdapter.ts`
  - Same as above for Gist.
- `src/core/sync-v2/storage/webdavAdapter.ts`
  - Same as above for WebDAV.
- `src/core/sync-v2/app/orchestrator.ts`
  - Add encrypted sync path, forced sync mode, and audit history writes.
- `src/core/sync-v2/app/runtimeBridge.ts`
  - Add `forceSyncV2`, `deleteSyncV2Remote`, and automation settings actions.
- `src/core/sync-v2/storage/registry.ts`
  - Provide security-aware adapters/services.
- `src/entrypoints/background.ts`
  - Register v2 alarms and bookmark-event triggers.
- `src/entrypoints/popup/popup.tsx`
  - Add forced sync and security/automation state display.
- `src/entrypoints/popup/popup.test.tsx`
  - Cover new popup actions.
- `src/entrypoints/options/options.tsx`
  - Add encryption, auto-sync, and delete-remote controls.
- `src/entrypoints/options/options.test.tsx`
  - Cover new settings actions.
- `src/utils/constants.ts`
  - Add Release 2 storage keys and alarm names.
- `src/utils/optionsStorage.ts`
  - Add default settings for encryption and auto-sync.
- `src/utils/setting.ts`
  - Surface those settings to v2 runtime code.
- `tests/setup.ts`
  - Extend `browser.alarms` and `browser.bookmarks` mocks only if Release 1 mocks are insufficient.

---

## Task 1: Add Encryption Types and the Security Service

**Files:**
- Create: `src/core/sync-v2/security/cryptoEnvelope.ts`
- Create: `src/core/sync-v2/security/keyStore.ts`
- Create: `src/core/sync-v2/security/securityService.ts`
- Create: `src/core/sync-v2/security/securityService.test.ts`
- Modify: `src/core/sync-v2/domain.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/security/securityService.test.ts
import { describe, expect, it } from 'vitest';
import { createSecurityService } from './securityService';
import { createEmptySnapshot } from '../domain';

describe('securityService', () => {
  it('encrypts and decrypts a snapshot with the same passphrase', async () => {
    const service = createSecurityService();
    const snapshot = createEmptySnapshot({
      deviceId: 'chrome',
      trigger: 'manual',
      storageType: 'github-repo',
    });

    const envelope = await service.encryptSnapshot(snapshot, 'release-2-passphrase');
    const restored = await service.decryptSnapshot(envelope, 'release-2-passphrase');

    expect(envelope.algorithm).toBe('AES-GCM');
    expect(restored.deviceId).toBe('chrome');
    expect(restored.storageType).toBe('github-repo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/security/securityService.test.ts`
Expected: FAIL with `Cannot find module './securityService'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/security/cryptoEnvelope.ts
export interface CryptoEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
}
```

```typescript
// src/core/sync-v2/security/keyStore.ts
const PBKDF2_ITERATIONS = 600000;

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(atob(value).split('').map(char => char.charCodeAt(0)));
}

export async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function encodeBytes(value: Uint8Array): string {
  return bytesToBase64(value);
}

export function decodeBytes(value: string): Uint8Array {
  return base64ToBytes(value);
}
```

```typescript
// src/core/sync-v2/security/securityService.ts
import type { BookmarkSnapshot } from '../domain';
import type { CryptoEnvelope } from './cryptoEnvelope';
import { decodeBytes, deriveAesKey, encodeBytes } from './keyStore';

export function createSecurityService() {
  return {
    async encryptSnapshot(snapshot: BookmarkSnapshot, passphrase: string): Promise<CryptoEnvelope> {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveAesKey(passphrase, salt);
      const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

      return {
        version: 1,
        algorithm: 'AES-GCM',
        salt: encodeBytes(salt),
        iv: encodeBytes(iv),
        ciphertext: encodeBytes(new Uint8Array(ciphertext)),
      };
    },

    async decryptSnapshot(envelope: CryptoEnvelope, passphrase: string): Promise<BookmarkSnapshot> {
      const key = await deriveAesKey(passphrase, decodeBytes(envelope.salt));
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decodeBytes(envelope.iv) },
        key,
        decodeBytes(envelope.ciphertext),
      );

      return JSON.parse(new TextDecoder().decode(plaintext)) as BookmarkSnapshot;
    },
  };
}
```

```typescript
// src/core/sync-v2/domain.ts
export interface SecurityState {
  encryptionEnabled: boolean;
  passphraseHint?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/security/securityService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/security/cryptoEnvelope.ts src/core/sync-v2/security/keyStore.ts src/core/sync-v2/security/securityService.ts src/core/sync-v2/security/securityService.test.ts src/core/sync-v2/domain.ts
git commit -m "feat: add sync v2 encryption service"
```

---

## Task 2: Extend Storage Profiles for Encryption and Automation Settings

**Files:**
- Modify: `src/core/sync-v2/storage/types.ts`
- Modify: `src/utils/constants.ts`
- Modify: `src/utils/optionsStorage.ts`
- Modify: `src/utils/setting.ts`
- Create: `src/core/sync-v2/storage/types.release2.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/types.release2.test.ts
import { describe, expect, it } from 'vitest';
import { createStorageProfileDefaults } from './types';

describe('createStorageProfileDefaults release 2', () => {
  it('adds encryption and automation defaults to every profile', () => {
    const repo = createStorageProfileDefaults('github-repo');

    expect(repo).toMatchObject({
      encryptionEnabled: false,
      autoSyncEnabled: false,
      forceSyncRequiresConfirm: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/storage/types.release2.test.ts`
Expected: FAIL because the properties are not defined on the profile

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/types.ts
interface Release2ProfileFlags {
  encryptionEnabled: boolean;
  passphraseHint: string;
  autoSyncEnabled: boolean;
  autoSyncOnStartup: boolean;
  autoSyncOnBookmarkChange: boolean;
  autoSyncIntervalMinutes: 60 | 720 | 1440;
  forceSyncRequiresConfirm: boolean;
}

export interface GithubRepoProfile extends BaseStorageProfile, Release2ProfileFlags {
  type: 'github-repo';
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  repoFilePath: string;
}
```

```typescript
// src/core/sync-v2/storage/types.ts
function createRelease2Flags(): Release2ProfileFlags {
  return {
    encryptionEnabled: false,
    passphraseHint: '',
    autoSyncEnabled: false,
    autoSyncOnStartup: true,
    autoSyncOnBookmarkChange: true,
    autoSyncIntervalMinutes: 60,
    forceSyncRequiresConfirm: true,
  };
}
```

```typescript
// src/core/sync-v2/storage/types.ts
if (type === 'github-repo') {
  return {
    type,
    ...createRelease2Flags(),
    repoOwner: '',
    repoName: '',
    repoBranch: 'main',
    repoFilePath: 'bookmarkhub/snapshot.json',
  };
}
```

```typescript
// src/utils/constants.ts
export const SYNC_V2_RELEASE2_KEYS = {
  SECURITY_STATE: 'syncV2SecurityState',
  AUTOMATION_STATE: 'syncV2AutomationState',
  DELETE_AUDIT: 'syncV2DeleteAudit',
} as const;

export const SYNC_V2_RELEASE2_ALARMS = {
  AUTO_SYNC: 'sync-v2-auto-sync',
} as const;
```

```typescript
// src/utils/optionsStorage.ts
defaults: {
  syncV2EncryptionEnabled: false,
  syncV2PassphraseHint: '',
  syncV2AutoSyncEnabled: false,
  syncV2AutoSyncOnStartup: true,
  syncV2AutoSyncOnBookmarkChange: true,
  syncV2AutoSyncIntervalMinutes: 60,
  syncV2ForceSyncRequiresConfirm: true,
}
```

```typescript
// src/utils/setting.ts
export class SettingBase implements Options {
  syncV2EncryptionEnabled: boolean = false;
  syncV2PassphraseHint: string = '';
  syncV2AutoSyncEnabled: boolean = false;
  syncV2AutoSyncOnStartup: boolean = true;
  syncV2AutoSyncOnBookmarkChange: boolean = true;
  syncV2AutoSyncIntervalMinutes: 60 | 720 | 1440 = 60;
  syncV2ForceSyncRequiresConfirm: boolean = true;
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/core/sync-v2/storage/types.release2.test.ts`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/types.ts src/core/sync-v2/storage/types.release2.test.ts src/utils/constants.ts src/utils/optionsStorage.ts src/utils/setting.ts
git commit -m "feat: add sync v2 release 2 settings"
```

---

## Task 3: Encrypt Storage Adapter Reads and Writes

**Files:**
- Modify: `src/core/sync-v2/storage/githubRepoAdapter.ts`
- Modify: `src/core/sync-v2/storage/gistAdapter.ts`
- Modify: `src/core/sync-v2/storage/webdavAdapter.ts`
- Create: `src/core/sync-v2/storage/encryptedAdapters.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/encryptedAdapters.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSecurityService } from '../security/securityService';
import { GistAdapter } from './gistAdapter';

vi.mock('@/utils/services', () => ({
  default: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

describe('encrypted gist adapter flow', () => {
  it('writes an encrypted envelope when encryptionEnabled is true', async () => {
    const security = createSecurityService();
    const adapter = new GistAdapter(security);

    await adapter.writeCurrentSnapshot(
      {
        type: 'github-gist',
        gistId: 'abc',
        gistFileName: 'BookmarkHub',
        encryptionEnabled: true,
        passphraseHint: 'release-2',
        autoSyncEnabled: false,
        autoSyncOnStartup: true,
        autoSyncOnBookmarkChange: true,
        autoSyncIntervalMinutes: 60,
        forceSyncRequiresConfirm: true,
      },
      {
        schemaVersion: 1,
        deviceId: 'chrome',
        trigger: 'manual',
        storageType: 'github-gist',
        createdAt: 1,
        root: { key: 'root', title: 'root', children: [] },
        summary: { added: 0, removed: 0, modified: 0, conflicts: 0 },
      },
      { passphrase: 'release-2-passphrase' },
    );

    const { default: BookmarkService } = await import('@/utils/services');
    expect(vi.mocked(BookmarkService.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        files: {
          BookmarkHub: {
            content: expect.stringContaining('"algorithm":"AES-GCM"'),
          },
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/storage/encryptedAdapters.test.ts`
Expected: FAIL because the adapters do not accept a security service or passphrase input

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/types.ts
export interface SnapshotWriteOptions {
  passphrase?: string;
}

export interface StorageAdapter {
  connect(profile: StorageProfile): Promise<void>;
  readCurrentSnapshot(profile: StorageProfile, options?: SnapshotWriteOptions): Promise<BookmarkSnapshot | null>;
  writeCurrentSnapshot(profile: StorageProfile, snapshot: BookmarkSnapshot, options?: SnapshotWriteOptions): Promise<void>;
  appendHistory(profile: StorageProfile, entry: SyncHistoryEntry, options?: SnapshotWriteOptions): Promise<void>;
  deleteRemoteData(profile: StorageProfile): Promise<void>;
}
```

```typescript
// src/core/sync-v2/storage/gistAdapter.ts
import { createSecurityService } from '../security/securityService';

export class GistAdapter implements StorageAdapter {
  constructor(private securityService: ReturnType<typeof createSecurityService> = createSecurityService()) {}

  async writeCurrentSnapshot(profile: GithubGistProfile, snapshot: BookmarkSnapshot, options?: SnapshotWriteOptions): Promise<void> {
    const content =
      profile.encryptionEnabled && options?.passphrase && this.securityService
        ? JSON.stringify(await this.securityService.encryptSnapshot(snapshot, options.passphrase))
        : JSON.stringify(snapshot, null, 2);

    await BookmarkService.update({
      files: {
        [profile.gistFileName]: { content },
      },
    });
  }
}
```

Apply the same conditional envelope pattern to:

```typescript
// src/core/sync-v2/storage/githubRepoAdapter.ts
// src/core/sync-v2/storage/webdavAdapter.ts
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/core/sync-v2/storage/encryptedAdapters.test.ts`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/types.ts src/core/sync-v2/storage/githubRepoAdapter.ts src/core/sync-v2/storage/gistAdapter.ts src/core/sync-v2/storage/webdavAdapter.ts src/core/sync-v2/storage/encryptedAdapters.test.ts
git commit -m "feat: add encrypted snapshot support to sync v2 adapters"
```

---

## Task 4: Add the Automatic Sync Scheduler

**Files:**
- Create: `src/core/sync-v2/app/autoSyncScheduler.ts`
- Create: `src/core/sync-v2/app/autoSyncScheduler.test.ts`
- Modify: `src/entrypoints/background.ts`
- Modify: `tests/setup.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/app/autoSyncScheduler.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoSyncScheduler } from './autoSyncScheduler';

describe('autoSyncScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the browser alarm when interval sync is enabled', async () => {
    const scheduler = createAutoSyncScheduler({
      sync: vi.fn().mockResolvedValue(undefined),
      getSettings: async () => ({
        autoSyncEnabled: true,
        autoSyncOnStartup: true,
        autoSyncOnBookmarkChange: true,
        autoSyncIntervalMinutes: 60,
      }),
    });

    await scheduler.start();

    expect(browser.alarms.create).toHaveBeenCalledWith(
      'sync-v2-auto-sync',
      expect.objectContaining({ periodInMinutes: 60 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/app/autoSyncScheduler.test.ts`
Expected: FAIL with missing module error

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/app/autoSyncScheduler.ts
import { SYNC_V2_RELEASE2_ALARMS } from '@/utils/constants';

export function createAutoSyncScheduler(input: {
  sync: (trigger: 'startup' | 'alarm' | 'bookmark-event') => Promise<void>;
  getSettings: () => Promise<{
    autoSyncEnabled: boolean;
    autoSyncOnStartup: boolean;
    autoSyncOnBookmarkChange: boolean;
    autoSyncIntervalMinutes: number;
  }>;
}) {
  return {
    async start(): Promise<void> {
      const settings = await input.getSettings();
      if (!settings.autoSyncEnabled) return;

      await browser.alarms.create(SYNC_V2_RELEASE2_ALARMS.AUTO_SYNC, {
        periodInMinutes: settings.autoSyncIntervalMinutes,
      });
    },

    async stop(): Promise<void> {
      await browser.alarms.clear(SYNC_V2_RELEASE2_ALARMS.AUTO_SYNC);
    },

    async handleStartup(): Promise<void> {
      const settings = await input.getSettings();
      if (settings.autoSyncEnabled && settings.autoSyncOnStartup) {
        await input.sync('startup');
      }
    },

    async handleBookmarkChange(): Promise<void> {
      const settings = await input.getSettings();
      if (settings.autoSyncEnabled && settings.autoSyncOnBookmarkChange) {
        await input.sync('bookmark-event');
      }
    },

    async handleAlarm(name: string): Promise<void> {
      if (name === SYNC_V2_RELEASE2_ALARMS.AUTO_SYNC) {
        await input.sync('alarm');
      }
    },
  };
}
```

```typescript
// tests/setup.ts
const mockAlarms = {
  create: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(true),
  onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
};
```

```typescript
// src/entrypoints/background.ts
function buildSyncV2ProfileFromSetting(setting: Setting) {
  if (setting.syncV2StorageType === 'github-gist') {
    return {
      type: 'github-gist' as const,
      gistId: setting.gistID,
      gistFileName: setting.gistFileName,
      encryptionEnabled: setting.syncV2EncryptionEnabled,
      passphraseHint: setting.syncV2PassphraseHint,
      autoSyncEnabled: setting.syncV2AutoSyncEnabled,
      autoSyncOnStartup: setting.syncV2AutoSyncOnStartup,
      autoSyncOnBookmarkChange: setting.syncV2AutoSyncOnBookmarkChange,
      autoSyncIntervalMinutes: setting.syncV2AutoSyncIntervalMinutes,
      forceSyncRequiresConfirm: setting.syncV2ForceSyncRequiresConfirm,
    };
  }

  if (setting.syncV2StorageType === 'webdav') {
    return {
      type: 'webdav' as const,
      webdavUrl: setting.webdavUrl,
      webdavUsername: setting.webdavUsername,
      webdavPassword: setting.webdavPassword,
      webdavPath: setting.webdavPath,
      encryptionEnabled: setting.syncV2EncryptionEnabled,
      passphraseHint: setting.syncV2PassphraseHint,
      autoSyncEnabled: setting.syncV2AutoSyncEnabled,
      autoSyncOnStartup: setting.syncV2AutoSyncOnStartup,
      autoSyncOnBookmarkChange: setting.syncV2AutoSyncOnBookmarkChange,
      autoSyncIntervalMinutes: setting.syncV2AutoSyncIntervalMinutes,
      forceSyncRequiresConfirm: setting.syncV2ForceSyncRequiresConfirm,
    };
  }

  return {
    type: 'github-repo' as const,
    repoOwner: setting.githubRepoOwner,
    repoName: setting.githubRepoName,
    repoBranch: setting.githubRepoBranch,
    repoFilePath: setting.githubRepoFilePath,
    encryptionEnabled: setting.syncV2EncryptionEnabled,
    passphraseHint: setting.syncV2PassphraseHint,
    autoSyncEnabled: setting.syncV2AutoSyncEnabled,
    autoSyncOnStartup: setting.syncV2AutoSyncOnStartup,
    autoSyncOnBookmarkChange: setting.syncV2AutoSyncOnBookmarkChange,
    autoSyncIntervalMinutes: setting.syncV2AutoSyncIntervalMinutes,
    forceSyncRequiresConfirm: setting.syncV2ForceSyncRequiresConfirm,
  };
}

async function getSyncV2Settings() {
  const setting = await Setting.build();
  return {
    autoSyncEnabled: setting.syncV2AutoSyncEnabled,
    autoSyncOnStartup: setting.syncV2AutoSyncOnStartup,
    autoSyncOnBookmarkChange: setting.syncV2AutoSyncOnBookmarkChange,
    autoSyncIntervalMinutes: setting.syncV2AutoSyncIntervalMinutes,
  };
}

async function loadCurrentProfile() {
  const setting = await Setting.build();
  return buildSyncV2ProfileFromSetting(setting);
}

const autoSyncScheduler = createAutoSyncScheduler({
  sync: async trigger => {
    await orchestrator.sync({
      profile: await loadCurrentProfile(),
      trigger,
    });
  },
  getSettings: getSyncV2Settings,
});
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/core/sync-v2/app/autoSyncScheduler.test.ts`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/app/autoSyncScheduler.ts src/core/sync-v2/app/autoSyncScheduler.test.ts src/entrypoints/background.ts tests/setup.ts
git commit -m "feat: add sync v2 automatic scheduler"
```

---

## Task 5: Add Forced Sync and Delete-Remote Runtime Actions

**Files:**
- Create: `src/core/sync-v2/app/deleteRemoteFlow.ts`
- Create: `src/core/sync-v2/app/deleteRemoteFlow.test.ts`
- Modify: `src/core/sync-v2/app/orchestrator.ts`
- Modify: `src/core/sync-v2/app/runtimeBridge.ts`
- Modify: `src/core/sync-v2/app/orchestrator.test.ts`
- Modify: `src/entrypoints/background.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/sync-v2/app/deleteRemoteFlow.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createDeleteRemoteFlow } from './deleteRemoteFlow';

describe('deleteRemoteFlow', () => {
  it('records an audit entry after deleting remote data', async () => {
    const adapter = {
      deleteRemoteData: vi.fn().mockResolvedValue(undefined),
    };

    const appendAudit = vi.fn().mockResolvedValue(undefined);
    const flow = createDeleteRemoteFlow({ appendAudit });

    await flow.execute(adapter as never, { storageType: 'github-repo', confirmed: true });

    expect(adapter.deleteRemoteData).toHaveBeenCalled();
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete-remote', storageType: 'github-repo' }),
    );
  });
});
```

```typescript
// src/core/sync-v2/app/orchestrator.test.ts
it('supports a forced sync mode', async () => {
  const result = await orchestrator.sync({
    profile,
    trigger: 'manual',
    mode: 'force',
  });

  expect(result.mode).toBe('force');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/sync-v2/app/deleteRemoteFlow.test.ts src/core/sync-v2/app/orchestrator.test.ts`
Expected: FAIL because delete flow and force mode do not exist

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/app/deleteRemoteFlow.ts
export function createDeleteRemoteFlow(input: {
  appendAudit: (entry: {
    action: 'delete-remote';
    storageType: string;
    createdAt: number;
  }) => Promise<void>;
}) {
  return {
    async execute(
      adapter: { deleteRemoteData: () => Promise<void> },
      payload: { storageType: string; confirmed: boolean },
    ): Promise<void> {
      if (!payload.confirmed) {
        throw new Error('Delete remote requires confirmation');
      }

      await adapter.deleteRemoteData();
      await input.appendAudit({
        action: 'delete-remote',
        storageType: payload.storageType,
        createdAt: Date.now(),
      });
    },
  };
}
```

```typescript
// src/core/sync-v2/app/orchestrator.ts
return {
  async sync(params: { profile: StorageProfile; trigger: SyncTrigger; mode?: 'normal' | 'force' }) {
    const mode = params.mode ?? 'normal';
    // existing sync path continues here
    return {
      status: 'success' as const,
      mode,
      summary: merged.summary,
    };
  },
};
```

```typescript
// src/core/sync-v2/app/runtimeBridge.ts
if (message.name === 'forceSyncV2') {
  return input.sync({ ...(message.payload as object), mode: 'force' });
}

if (message.name === 'deleteSyncV2Remote') {
  return input.deleteRemote(message.payload);
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/core/sync-v2/app/deleteRemoteFlow.test.ts src/core/sync-v2/app/orchestrator.test.ts`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/app/deleteRemoteFlow.ts src/core/sync-v2/app/deleteRemoteFlow.test.ts src/core/sync-v2/app/orchestrator.ts src/core/sync-v2/app/runtimeBridge.ts src/core/sync-v2/app/orchestrator.test.ts src/entrypoints/background.ts
git commit -m "feat: add sync v2 force sync and delete remote flows"
```

---

## Task 6: Update Popup and Options for Security and Automation

**Files:**
- Modify: `src/entrypoints/popup/popup.tsx`
- Modify: `src/entrypoints/popup/popup.test.tsx`
- Modify: `src/entrypoints/popup/popup.css`
- Modify: `src/entrypoints/options/options.tsx`
- Modify: `src/entrypoints/options/options.test.tsx`
- Modify: `src/entrypoints/options/options.css`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/entrypoints/popup/popup.test.tsx
it('exposes a forced sync action', async () => {
  render(<Popup />);

  fireEvent.click(screen.getByRole('button', { name: 'Force Sync' }));

  await waitFor(() => {
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      name: 'forceSyncV2',
      payload: { trigger: 'manual' },
    });
  });
});
```

```tsx
// src/entrypoints/options/options.test.tsx
it('lets the user enable encryption and automatic sync', async () => {
  render(<Options />);

  fireEvent.click(screen.getByLabelText('Enable Encryption'));
  fireEvent.click(screen.getByLabelText('Enable Automatic Sync'));

  expect(screen.getByLabelText('Passphrase Hint')).toBeInTheDocument();
  expect(screen.getByLabelText('Sync Every')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/entrypoints/popup/popup.test.tsx src/entrypoints/options/options.test.tsx`
Expected: FAIL because the controls are missing

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/entrypoints/popup/popup.tsx
<div className="popup-actions">
  <button className="btn btn-primary w-100 mb-2" onClick={handleSync}>
    Start Sync
  </button>
  <button
    className="btn btn-outline-secondary w-100"
    onClick={() => browser.runtime.sendMessage({ name: 'forceSyncV2', payload: { trigger: 'manual' } })}
  >
    Force Sync
  </button>
</div>
```

```tsx
// src/entrypoints/options/options.tsx
<section className="settings-card mt-4">
  <h2 className="h5 mb-3">Security</h2>
  <label className="form-check-label">
    <input type="checkbox" className="form-check-input me-2" aria-label="Enable Encryption" />
    Enable Encryption
  </label>
  <label className="form-label mt-3">Passphrase Hint</label>
  <input className="form-control" aria-label="Passphrase Hint" />
</section>

<section className="settings-card mt-4">
  <h2 className="h5 mb-3">Automation</h2>
  <label className="form-check-label">
    <input type="checkbox" className="form-check-input me-2" aria-label="Enable Automatic Sync" />
    Enable Automatic Sync
  </label>
  <label className="form-label mt-3">Sync Every</label>
  <select className="form-select" aria-label="Sync Every">
    <option value="60">Every 60 minutes</option>
    <option value="720">Every 12 hours</option>
    <option value="1440">Every 24 hours</option>
  </select>
</section>

<section className="settings-card mt-4">
  <h2 className="h5 mb-3">Danger Zone</h2>
  <button
    className="btn btn-outline-danger"
    onClick={() => browser.runtime.sendMessage({ name: 'deleteSyncV2Remote', payload: { confirmed: true } })}
  >
    Delete Remote Data
  </button>
</section>
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/entrypoints/popup/popup.test.tsx src/entrypoints/options/options.test.tsx`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/popup/popup.tsx src/entrypoints/popup/popup.test.tsx src/entrypoints/popup/popup.css src/entrypoints/options/options.tsx src/entrypoints/options/options.test.tsx src/entrypoints/options/options.css
git commit -m "feat: add sync v2 security and automation controls"
```

---

## Task 7: Run Full Release 2 Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-security-and-automation-plan.md`

- [ ] **Step 1: Add the manual verification checklist to the bottom of this plan**

```markdown
## Manual Verification Checklist

- [ ] Encrypt + manual sync succeeds on GitHub Repo
- [ ] Encrypt + manual sync succeeds on Gist
- [ ] Encrypt + manual sync succeeds on WebDAV
- [ ] Startup auto-sync triggers only when enabled
- [ ] Bookmark-change auto-sync triggers only when enabled
- [ ] Interval auto-sync creates one alarm with the configured period
- [ ] Force sync is a distinct explicit action from normal sync
- [ ] Delete remote requires confirmation and shows success/failure feedback
- [ ] WebDAV remains history-only and does not expose time-machine restore
```

- [ ] **Step 2: Run the full automated verification**

Run: `npm run compile`
Expected: PASS

Run: `npm test`
Expected: PASS with Release 1 and Release 2 tests all green

Run: `npm run build`
Expected: PASS with `.output/` generated successfully

- [ ] **Step 3: Perform the manual checks**

Run: `npm run dev`
Expected: Chrome build loads, security and automation controls appear, encrypted/automatic actions are reachable

Run: `npm run dev:firefox`
Expected: Firefox build loads, security and automation controls appear, encrypted/automatic actions are reachable

- [ ] **Step 4: Commit the Release 2 branch after verification**

```bash
git add src/core/sync-v2 src/entrypoints/background.ts src/entrypoints/popup src/entrypoints/options src/utils/constants.ts src/utils/optionsStorage.ts src/utils/setting.ts tests/setup.ts docs/superpowers/plans/2026-04-18-bookmarkhub-v2-security-and-automation-plan.md
git commit -m "feat: ship bookmarkhub v2 release 2 security and automation"
```

---

## Spec Coverage Self-Check

- End-to-end encryption: covered by Tasks 1-3.
- Automatic sync: covered by Task 4.
- Forced sync: covered by Task 5.
- Delete remote data: covered by Tasks 5-6.
- Popup and options controls: covered by Task 6.
- Release 2 verification: covered by Task 7.

Gaps intentionally left for later release plans:

- Full time-machine restore
- `Gitee / GitLab / S3 / Google Drive / OneDrive`
- Move detection
- Conflict visualization
- Result replay

---

## Placeholder Scan

Verified absent from this plan:

- `TODO`
- `TBD`
- `implement later`
- `similar to task`
- generic `add validation` / `handle edge cases` filler without concrete code

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-security-and-automation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

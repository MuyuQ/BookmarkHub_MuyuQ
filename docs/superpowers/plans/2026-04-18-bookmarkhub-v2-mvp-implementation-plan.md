# BookmarkHub v2 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved BookmarkHub v2 MVP: a new sync core with `GitHub Repo / Gist / WebDAV`, manual sync, add/delete/modify merge, basic history, and updated popup/options surfaces.

**Architecture:** Keep the existing WXT entrypoints, but introduce a focused `src/core/sync-v2/` module tree for the new domain model, storage adapters, merge engine, history store, and orchestrator. Wire the existing background entrypoint and React UIs to that core without attempting Phase 2 features such as encryption, automatic sync, or full time-machine restore.

**Tech Stack:** WXT 0.19, React 18, TypeScript, Vitest, Testing Library, ky, browser.bookmarks API, browser.storage API

---

> This document is the `Release 1 / MVP` sub-plan of the broader product-parity program at [2026-04-18-bookmarkhub-v2-product-parity-program-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-product-parity-program-plan.md).

---

## Scope Guard

This plan implements only `Phase 0` and `Phase 1` from the approved design spec at [2026-04-18-bookmarkhub-v2-extension-design.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/specs/2026-04-18-bookmarkhub-v2-extension-design.md).

Do not pull these into this plan:

- End-to-end encryption
- Automatic sync or forced sync
- Full time-machine restore
- `Gitee / GitLab / S3 / Google Drive / OneDrive`
- Move detection
- Conflict visualization
- Result replay

If any of those become necessary while implementing MVP, stop and write a follow-up plan instead of quietly expanding scope.

---

## File Structure

### New files

- `src/core/sync-v2/domain.ts`
  - Canonical snapshot, node, summary, and history types for v2.
- `src/core/sync-v2/index.ts`
  - Public barrel exports for the v2 core.
- `src/core/sync-v2/storage/types.ts`
  - Storage profile types, adapter contracts, and capability helpers.
- `src/core/sync-v2/storage/githubRepoAdapter.ts`
  - GitHub repository snapshot/history adapter using the GitHub Contents API.
- `src/core/sync-v2/storage/gistAdapter.ts`
  - Gist adapter that wraps existing Gist behaviors behind the new contract.
- `src/core/sync-v2/storage/webdavAdapter.ts`
  - WebDAV adapter that wraps `WebDAVClient` behind the new contract.
- `src/core/sync-v2/storage/registry.ts`
  - Factory for resolving a configured profile into a concrete adapter.
- `src/core/sync-v2/engine/merge.ts`
  - MVP diff and merge implementation for add/delete/modify only.
- `src/core/sync-v2/app/historyStore.ts`
  - Local storage-backed history persistence for recent sync sessions.
- `src/core/sync-v2/app/orchestrator.ts`
  - Main manual sync flow for the MVP.
- `src/core/sync-v2/app/runtimeBridge.ts`
  - Message handlers used by `background.ts`.
- `src/core/sync-v2/*.test.ts`
  - Targeted unit tests colocated with each v2 module.
- `src/entrypoints/popup/popup.test.tsx`
  - Popup MVP behavior tests.
- `src/entrypoints/options/options.test.tsx`
  - Options MVP behavior tests.

### Existing files to modify

- `src/utils/constants.ts`
  - Add v2 keys and storage type constants.
- `src/utils/optionsStorage.ts`
  - Add v2 storage defaults for GitHub Repo, Gist, and WebDAV.
- `src/utils/setting.ts`
  - Expose typed v2 storage settings to runtime code.
- `src/entrypoints/background.ts`
  - Route new v2 runtime messages while leaving legacy handlers untouched.
- `src/entrypoints/popup/popup.tsx`
  - Replace the action-first dropdown with an MVP status panel.
- `src/entrypoints/popup/popup.css`
  - Style the MVP status panel.
- `src/entrypoints/options/options.tsx`
  - Add storage-type switching and connection testing for v2 profiles.
- `src/entrypoints/options/options.css`
  - Style the new options sections.
- `tests/setup.ts`
  - Extend browser API mocks only if a new API surface is needed by tests.

---

## Task 1: Create the v2 Domain Model

**Files:**
- Create: `src/core/sync-v2/domain.ts`
- Create: `src/core/sync-v2/domain.test.ts`
- Create: `src/core/sync-v2/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/domain.test.ts
import { describe, expect, it } from 'vitest';
import {
  createEmptySnapshot,
  isFolderNode,
  type BookmarkNode,
} from './domain';

describe('createEmptySnapshot', () => {
  it('creates a normalized empty snapshot', () => {
    const snapshot = createEmptySnapshot({
      deviceId: 'chrome-windows',
      trigger: 'manual',
      storageType: 'github-repo',
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.deviceId).toBe('chrome-windows');
    expect(snapshot.trigger).toBe('manual');
    expect(snapshot.root.children).toEqual([]);
    expect(snapshot.summary).toEqual({
      added: 0,
      removed: 0,
      modified: 0,
      conflicts: 0,
    });
  });
});

describe('isFolderNode', () => {
  it('treats nodes with children as folders', () => {
    const node: BookmarkNode = {
      key: 'toolbar',
      title: 'Toolbar',
      children: [],
    };

    expect(isFolderNode(node)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/domain.test.ts`
Expected: FAIL with `Cannot find module './domain'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/domain.ts
export type SyncTrigger = 'manual' | 'startup' | 'alarm' | 'bookmark-event';
export type StorageType = 'github-repo' | 'github-gist' | 'webdav';

export interface BookmarkNode {
  key: string;
  title: string;
  url?: string;
  children: BookmarkNode[];
}

export interface SyncSummary {
  added: number;
  removed: number;
  modified: number;
  conflicts: number;
}

export interface BookmarkSnapshot {
  schemaVersion: 1;
  deviceId: string;
  trigger: SyncTrigger;
  storageType: StorageType;
  createdAt: number;
  root: BookmarkNode;
  summary: SyncSummary;
}

export interface SyncHistoryEntry {
  sessionId: string;
  createdAt: number;
  status: 'success' | 'failed';
  trigger: SyncTrigger;
  storageType: StorageType;
  summary: SyncSummary;
  errorMessage?: string;
}

export function createEmptySnapshot(input: {
  deviceId: string;
  trigger: SyncTrigger;
  storageType: StorageType;
}): BookmarkSnapshot {
  return {
    schemaVersion: 1,
    deviceId: input.deviceId,
    trigger: input.trigger,
    storageType: input.storageType,
    createdAt: Date.now(),
    root: {
      key: 'root',
      title: 'root',
      children: [],
    },
    summary: {
      added: 0,
      removed: 0,
      modified: 0,
      conflicts: 0,
    },
  };
}

export function isFolderNode(node: BookmarkNode): boolean {
  return Array.isArray(node.children);
}
```

```typescript
// src/core/sync-v2/index.ts
export * from './domain';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/domain.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/domain.ts src/core/sync-v2/domain.test.ts src/core/sync-v2/index.ts
git commit -m "feat: add sync v2 domain model"
```

---

## Task 2: Add MVP Storage Profiles and Adapter Contracts

**Files:**
- Create: `src/core/sync-v2/storage/types.ts`
- Create: `src/core/sync-v2/storage/types.test.ts`
- Modify: `src/utils/constants.ts`
- Modify: `src/utils/optionsStorage.ts`
- Modify: `src/utils/setting.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/types.test.ts
import { describe, expect, it } from 'vitest';
import {
  createStorageProfileDefaults,
  getStorageCapabilities,
  isMvpStorageType,
} from './types';

describe('isMvpStorageType', () => {
  it('accepts only the MVP storage backends', () => {
    expect(isMvpStorageType('github-repo')).toBe(true);
    expect(isMvpStorageType('github-gist')).toBe(true);
    expect(isMvpStorageType('webdav')).toBe(true);
  });
});

describe('getStorageCapabilities', () => {
  it('marks webdav as history-only for MVP', () => {
    expect(getStorageCapabilities('webdav')).toEqual({
      supportsBasicHistory: true,
      supportsTimeMachine: false,
    });
  });
});

describe('createStorageProfileDefaults', () => {
  it('creates repo defaults for GitHub repository storage', () => {
    expect(createStorageProfileDefaults('github-repo')).toMatchObject({
      type: 'github-repo',
      repoOwner: '',
      repoName: '',
      repoBranch: 'main',
      repoFilePath: 'bookmarkhub/snapshot.json',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/storage/types.test.ts`
Expected: FAIL with `Cannot find module './types'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/types.ts
import type { BookmarkSnapshot, StorageType, SyncHistoryEntry } from '../domain';

export interface BaseStorageProfile {
  type: StorageType;
}

export interface GithubRepoProfile extends BaseStorageProfile {
  type: 'github-repo';
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  repoFilePath: string;
}

export interface GithubGistProfile extends BaseStorageProfile {
  type: 'github-gist';
  gistId: string;
  gistFileName: string;
}

export interface WebdavProfile extends BaseStorageProfile {
  type: 'webdav';
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavPath: string;
}

export type StorageProfile = GithubRepoProfile | GithubGistProfile | WebdavProfile;

export interface StorageAdapter {
  connect(profile: StorageProfile): Promise<void>;
  readCurrentSnapshot(profile: StorageProfile): Promise<BookmarkSnapshot | null>;
  writeCurrentSnapshot(profile: StorageProfile, snapshot: BookmarkSnapshot): Promise<void>;
  appendHistory(profile: StorageProfile, entry: SyncHistoryEntry): Promise<void>;
  deleteRemoteData(profile: StorageProfile): Promise<void>;
}

export function isMvpStorageType(value: string): value is StorageType {
  return value === 'github-repo' || value === 'github-gist' || value === 'webdav';
}

export function getStorageCapabilities(type: StorageType): {
  supportsBasicHistory: boolean;
  supportsTimeMachine: boolean;
} {
  return {
    supportsBasicHistory: true,
    supportsTimeMachine: type !== 'webdav',
  };
}

export function createStorageProfileDefaults(type: StorageType): StorageProfile {
  if (type === 'github-repo') {
    return {
      type,
      repoOwner: '',
      repoName: '',
      repoBranch: 'main',
      repoFilePath: 'bookmarkhub/snapshot.json',
    };
  }

  if (type === 'github-gist') {
    return {
      type,
      gistId: '',
      gistFileName: 'BookmarkHub',
    };
  }

  return {
    type,
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
    webdavPath: '/bookmarkhub/snapshot.json',
  };
}
```

```typescript
// src/utils/constants.ts
export const SYNC_V2_STORAGE_TYPES = {
  GITHUB_REPO: 'github-repo',
  GITHUB_GIST: 'github-gist',
  WEBDAV: 'webdav',
} as const;

export const STORAGE_KEYS_V2 = {
  CURRENT_STORAGE_TYPE: 'syncV2StorageType',
  HISTORY: 'syncV2History',
  LAST_RESULT: 'syncV2LastResult',
} as const;
```

```typescript
// src/utils/optionsStorage.ts
defaults: {
  // existing fields stay in place until legacy cutover is complete
  syncV2StorageType: 'github-repo',
  githubRepoOwner: '',
  githubRepoName: '',
  githubRepoBranch: 'main',
  githubRepoFilePath: 'bookmarkhub/snapshot.json',
  syncV2HistoryLimit: 20,
  syncV2Enabled: true,
}
```

```typescript
// src/utils/setting.ts
export class SettingBase implements Options {
  syncV2StorageType: 'github-repo' | 'github-gist' | 'webdav' = 'github-repo';
  githubRepoOwner: string = '';
  githubRepoName: string = '';
  githubRepoBranch: string = 'main';
  githubRepoFilePath: string = 'bookmarkhub/snapshot.json';
  syncV2HistoryLimit: number = 20;
  syncV2Enabled: boolean = true;
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/core/sync-v2/storage/types.test.ts`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/types.ts src/core/sync-v2/storage/types.test.ts src/utils/constants.ts src/utils/optionsStorage.ts src/utils/setting.ts
git commit -m "feat: add sync v2 storage contracts and settings"
```

---

## Task 3: Implement the GitHub Repository Adapter

**Files:**
- Create: `src/core/sync-v2/storage/githubRepoAdapter.ts`
- Create: `src/core/sync-v2/storage/githubRepoAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/githubRepoAdapter.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/utils/http';
import { createEmptySnapshot } from '../domain';
import { createStorageProfileDefaults } from './types';
import { GithubRepoAdapter } from './githubRepoAdapter';

vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('GithubRepoAdapter', () => {
  const profile = createStorageProfileDefaults('github-repo');
  const adapter = new GithubRepoAdapter();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes the snapshot to the GitHub contents API', async () => {
    vi.mocked(http.get).mockResolvedValueOnce({
      json: async () => ({ sha: 'old-sha' }),
    } as never);
    vi.mocked(http.put).mockResolvedValueOnce({
      json: async () => ({ content: { sha: 'new-sha' } }),
    } as never);

    await adapter.writeCurrentSnapshot(
      {
        ...profile,
        repoOwner: 'demo',
        repoName: 'bookmarkhub',
      },
      createEmptySnapshot({
        deviceId: 'chrome',
        trigger: 'manual',
        storageType: 'github-repo',
      }),
    );

    expect(http.put).toHaveBeenCalledWith(
      'repos/demo/bookmarkhub/contents/bookmarkhub/snapshot.json',
      expect.objectContaining({
        json: expect.objectContaining({
          branch: 'main',
          message: expect.stringContaining('sync'),
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/storage/githubRepoAdapter.test.ts`
Expected: FAIL with `Cannot find module './githubRepoAdapter'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/githubRepoAdapter.ts
import { http } from '@/utils/http';
import type { BookmarkSnapshot, SyncHistoryEntry } from '../domain';
import type { GithubRepoProfile, StorageAdapter } from './types';

function encodeContent(value: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value, null, 2))));
}

function decodeContent<T>(value: string): T {
  return JSON.parse(decodeURIComponent(escape(atob(value)))) as T;
}

export class GithubRepoAdapter implements StorageAdapter {
  async connect(profile: GithubRepoProfile): Promise<void> {
    await http.get(`repos/${profile.repoOwner}/${profile.repoName}`);
  }

  async readCurrentSnapshot(profile: GithubRepoProfile): Promise<BookmarkSnapshot | null> {
    try {
      const response = await http
        .get(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`, {
          searchParams: { ref: profile.repoBranch },
        })
        .json<{ content: string }>();

      return decodeContent<BookmarkSnapshot>(response.content);
    } catch {
      return null;
    }
  }

  async writeCurrentSnapshot(profile: GithubRepoProfile, snapshot: BookmarkSnapshot): Promise<void> {
    let sha: string | undefined;

    try {
      const existing = await http
        .get(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`, {
          searchParams: { ref: profile.repoBranch },
        })
        .json<{ sha: string }>();
      sha = existing.sha;
    } catch {
      sha = undefined;
    }

    await http.put(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`, {
      json: {
        branch: profile.repoBranch,
        message: `sync: update ${profile.repoFilePath}`,
        content: encodeContent(snapshot),
        sha,
      },
    });
  }

  async appendHistory(profile: GithubRepoProfile, entry: SyncHistoryEntry): Promise<void> {
    const historyPath = profile.repoFilePath.replace('snapshot.json', 'history.json');
    await http.put(`repos/${profile.repoOwner}/${profile.repoName}/contents/${historyPath}`, {
      json: {
        branch: profile.repoBranch,
        message: `sync: append history ${entry.sessionId}`,
        content: encodeContent([entry]),
      },
    });
  }

  async deleteRemoteData(profile: GithubRepoProfile): Promise<void> {
    const existing = await http
      .get(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`, {
        searchParams: { ref: profile.repoBranch },
      })
      .json<{ sha: string }>();

    await http.delete(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`, {
      json: {
        branch: profile.repoBranch,
        message: `sync: delete ${profile.repoFilePath}`,
        sha: existing.sha,
      },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/storage/githubRepoAdapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/githubRepoAdapter.ts src/core/sync-v2/storage/githubRepoAdapter.test.ts
git commit -m "feat: add github repo adapter for sync v2"
```

---

## Task 4: Wrap Gist Behind the v2 Storage Contract

**Files:**
- Create: `src/core/sync-v2/storage/gistAdapter.ts`
- Create: `src/core/sync-v2/storage/gistAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/gistAdapter.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookmarkService from '@/utils/services';
import { createEmptySnapshot } from '../domain';
import { GistAdapter } from './gistAdapter';

vi.mock('@/utils/services', () => ({
  default: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

describe('GistAdapter', () => {
  const adapter = new GistAdapter();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reads and parses the current snapshot from gist content', async () => {
    vi.mocked(BookmarkService.get).mockResolvedValueOnce(
      JSON.stringify(
        createEmptySnapshot({
          deviceId: 'chrome',
          trigger: 'manual',
          storageType: 'github-gist',
        }),
      ),
    );

    const snapshot = await adapter.readCurrentSnapshot({
      type: 'github-gist',
      gistId: 'abc',
      gistFileName: 'BookmarkHub',
    });

    expect(snapshot?.storageType).toBe('github-gist');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/storage/gistAdapter.test.ts`
Expected: FAIL with `Cannot find module './gistAdapter'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/gistAdapter.ts
import BookmarkService from '@/utils/services';
import type { BookmarkSnapshot, SyncHistoryEntry } from '../domain';
import type { GithubGistProfile, StorageAdapter } from './types';

export class GistAdapter implements StorageAdapter {
  async connect(): Promise<void> {
    await BookmarkService.get();
  }

  async readCurrentSnapshot(_profile: GithubGistProfile): Promise<BookmarkSnapshot | null> {
    const raw = await BookmarkService.get();
    return raw ? (JSON.parse(raw) as BookmarkSnapshot) : null;
  }

  async writeCurrentSnapshot(profile: GithubGistProfile, snapshot: BookmarkSnapshot): Promise<void> {
    await BookmarkService.update({
      files: {
        [profile.gistFileName]: {
          content: JSON.stringify(snapshot, null, 2),
        },
      },
    });
  }

  async appendHistory(profile: GithubGistProfile, entry: SyncHistoryEntry): Promise<void> {
    await BookmarkService.update({
      files: {
        [`${profile.gistFileName}.history.json`]: {
          content: JSON.stringify([entry], null, 2),
        },
      },
    });
  }

  async deleteRemoteData(profile: GithubGistProfile): Promise<void> {
    await BookmarkService.update({
      files: {
        [profile.gistFileName]: { content: '' },
      },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/storage/gistAdapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/gistAdapter.ts src/core/sync-v2/storage/gistAdapter.test.ts
git commit -m "feat: add gist adapter for sync v2"
```

---

## Task 5: Wrap WebDAV Behind the v2 Storage Contract

**Files:**
- Create: `src/core/sync-v2/storage/webdavAdapter.ts`
- Create: `src/core/sync-v2/storage/webdavAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/webdavAdapter.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebDAVClient } from '@/utils/webdav';
import { createEmptySnapshot } from '../domain';
import { WebdavAdapter } from './webdavAdapter';

vi.mock('@/utils/webdav', () => ({
  WebDAVClient: vi.fn(),
}));

describe('WebdavAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes the snapshot using the configured WebDAV path', async () => {
    const write = vi.fn().mockResolvedValue(true);
    vi.mocked(WebDAVClient).mockImplementation(() => ({ write }) as never);

    const adapter = new WebdavAdapter();

    await adapter.writeCurrentSnapshot(
      {
        type: 'webdav',
        webdavUrl: 'https://dav.example.com',
        webdavUsername: 'user',
        webdavPassword: 'pass',
        webdavPath: '/bookmarkhub/snapshot.json',
      },
      createEmptySnapshot({
        deviceId: 'chrome',
        trigger: 'manual',
        storageType: 'webdav',
      }),
    );

    expect(write).toHaveBeenCalledWith(
      '/bookmarkhub/snapshot.json',
      expect.stringContaining('"storageType": "webdav"'),
      'application/json',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/storage/webdavAdapter.test.ts`
Expected: FAIL with `Cannot find module './webdavAdapter'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/webdavAdapter.ts
import { WebDAVClient } from '@/utils/webdav';
import type { BookmarkSnapshot, SyncHistoryEntry } from '../domain';
import type { StorageAdapter, WebdavProfile } from './types';

export class WebdavAdapter implements StorageAdapter {
  private createClient(profile: WebdavProfile): WebDAVClient {
    return new WebDAVClient(profile.webdavUrl, profile.webdavUsername, profile.webdavPassword);
  }

  async connect(profile: WebdavProfile): Promise<void> {
    const client = this.createClient(profile);
    await client.exists(profile.webdavPath);
  }

  async readCurrentSnapshot(profile: WebdavProfile): Promise<BookmarkSnapshot | null> {
    const client = this.createClient(profile);
    const raw = await client.read(profile.webdavPath);
    return raw ? (JSON.parse(raw) as BookmarkSnapshot) : null;
  }

  async writeCurrentSnapshot(profile: WebdavProfile, snapshot: BookmarkSnapshot): Promise<void> {
    const client = this.createClient(profile);
    const ok = await client.write(profile.webdavPath, JSON.stringify(snapshot, null, 2), 'application/json');
    if (!ok) {
      throw new Error('WebDAV snapshot write failed');
    }
  }

  async appendHistory(profile: WebdavProfile, entry: SyncHistoryEntry): Promise<void> {
    const client = this.createClient(profile);
    const historyPath = profile.webdavPath.replace('snapshot.json', 'history.json');
    const ok = await client.write(historyPath, JSON.stringify([entry], null, 2), 'application/json');
    if (!ok) {
      throw new Error('WebDAV history write failed');
    }
  }

  async deleteRemoteData(profile: WebdavProfile): Promise<void> {
    const client = this.createClient(profile);
    const ok = await client.write(profile.webdavPath, '', 'application/json');
    if (!ok) {
      throw new Error('WebDAV delete failed');
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/storage/webdavAdapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/webdavAdapter.ts src/core/sync-v2/storage/webdavAdapter.test.ts
git commit -m "feat: add webdav adapter for sync v2"
```

---

## Task 6: Implement the MVP Merge Engine and Local History Store

**Files:**
- Create: `src/core/sync-v2/engine/merge.ts`
- Create: `src/core/sync-v2/engine/merge.test.ts`
- Create: `src/core/sync-v2/app/historyStore.ts`
- Create: `src/core/sync-v2/app/historyStore.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/sync-v2/engine/merge.test.ts
import { describe, expect, it } from 'vitest';
import { mergeSnapshots } from './merge';
import type { BookmarkSnapshot } from '../domain';

function snapshot(rootChildren: BookmarkSnapshot['root']['children']): BookmarkSnapshot {
  return {
    schemaVersion: 1,
    deviceId: 'chrome',
    trigger: 'manual',
    storageType: 'github-repo',
    createdAt: 1,
    root: { key: 'root', title: 'root', children: rootChildren },
    summary: { added: 0, removed: 0, modified: 0, conflicts: 0 },
  };
}

describe('mergeSnapshots', () => {
  it('counts additions from the local side', () => {
    const result = mergeSnapshots(
      snapshot([{ key: 'a', title: 'A', url: 'https://a.com', children: [] }]),
      snapshot([]),
    );

    expect(result.summary.added).toBe(1);
    expect(result.snapshot.root.children).toHaveLength(1);
  });

  it('counts modifications when url changed at the same key', () => {
    const result = mergeSnapshots(
      snapshot([{ key: 'a', title: 'A', url: 'https://new.com', children: [] }]),
      snapshot([{ key: 'a', title: 'A', url: 'https://old.com', children: [] }]),
    );

    expect(result.summary.modified).toBe(1);
  });
});
```

```typescript
// src/core/sync-v2/app/historyStore.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createHistoryStore } from './historyStore';

describe('historyStore', () => {
  beforeEach(async () => {
    await browser.storage.local.remove('syncV2History');
  });

  it('keeps the newest entries first and trims to the configured limit', async () => {
    const store = createHistoryStore({ limit: 2 });

    await store.append({ sessionId: '1', createdAt: 1, status: 'success', trigger: 'manual', storageType: 'github-repo', summary: { added: 1, removed: 0, modified: 0, conflicts: 0 } });
    await store.append({ sessionId: '2', createdAt: 2, status: 'success', trigger: 'manual', storageType: 'github-repo', summary: { added: 0, removed: 1, modified: 0, conflicts: 0 } });
    await store.append({ sessionId: '3', createdAt: 3, status: 'failed', trigger: 'manual', storageType: 'github-repo', summary: { added: 0, removed: 0, modified: 1, conflicts: 0 } });

    const entries = await store.list();
    expect(entries.map(item => item.sessionId)).toEqual(['3', '2']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/sync-v2/engine/merge.test.ts src/core/sync-v2/app/historyStore.test.ts`
Expected: FAIL with missing module errors

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/engine/merge.ts
import type { BookmarkNode, BookmarkSnapshot, SyncSummary } from '../domain';

function flatten(nodes: BookmarkNode[], acc = new Map<string, BookmarkNode>()): Map<string, BookmarkNode> {
  for (const node of nodes) {
    acc.set(node.key, node);
    flatten(node.children, acc);
  }
  return acc;
}

export function mergeSnapshots(local: BookmarkSnapshot, remote: BookmarkSnapshot): {
  snapshot: BookmarkSnapshot;
  summary: SyncSummary;
} {
  const localMap = flatten(local.root.children);
  const remoteMap = flatten(remote.root.children);

  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const [key, localNode] of localMap.entries()) {
    const remoteNode = remoteMap.get(key);
    if (!remoteNode) {
      added += 1;
      continue;
    }

    if (localNode.url !== remoteNode.url || localNode.title !== remoteNode.title) {
      modified += 1;
    }
  }

  for (const key of remoteMap.keys()) {
    if (!localMap.has(key)) {
      removed += 1;
    }
  }

  return {
    snapshot: {
      ...local,
      summary: { added, removed, modified, conflicts: 0 },
    },
    summary: { added, removed, modified, conflicts: 0 },
  };
}
```

```typescript
// src/core/sync-v2/app/historyStore.ts
import type { SyncHistoryEntry } from '../domain';

export function createHistoryStore(input: { limit: number }) {
  const key = 'syncV2History';

  return {
    async list(): Promise<SyncHistoryEntry[]> {
      const result = await browser.storage.local.get(key);
      return (result[key] as SyncHistoryEntry[] | undefined) ?? [];
    },

    async append(entry: SyncHistoryEntry): Promise<void> {
      const current = await this.list();
      const next = [entry, ...current].slice(0, input.limit);
      await browser.storage.local.set({ [key]: next });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/sync-v2/engine/merge.test.ts src/core/sync-v2/app/historyStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/engine/merge.ts src/core/sync-v2/engine/merge.test.ts src/core/sync-v2/app/historyStore.ts src/core/sync-v2/app/historyStore.test.ts
git commit -m "feat: add merge engine and history store for sync v2"
```

---

## Task 7: Build the Orchestrator, Adapter Registry, and Background Bridge

**Files:**
- Create: `src/core/sync-v2/storage/registry.ts`
- Create: `src/core/sync-v2/app/orchestrator.ts`
- Create: `src/core/sync-v2/app/orchestrator.test.ts`
- Create: `src/core/sync-v2/app/runtimeBridge.ts`
- Create: `src/core/sync-v2/app/runtimeBridge.test.ts`
- Modify: `src/entrypoints/background.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/sync-v2/app/orchestrator.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSyncOrchestrator } from './orchestrator';
import { createEmptySnapshot } from '../domain';

describe('createSyncOrchestrator', () => {
  it('writes a merged snapshot and appends history', async () => {
    const adapter = {
      connect: vi.fn(),
      readCurrentSnapshot: vi.fn().mockResolvedValue(createEmptySnapshot({
        deviceId: 'remote',
        trigger: 'manual',
        storageType: 'github-repo',
      })),
      writeCurrentSnapshot: vi.fn().mockResolvedValue(undefined),
      appendHistory: vi.fn().mockResolvedValue(undefined),
      deleteRemoteData: vi.fn().mockResolvedValue(undefined),
    };

    const historyStore = {
      append: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    };

    const orchestrator = createSyncOrchestrator({
      getAdapter: () => adapter,
      getLocalSnapshot: async () => createEmptySnapshot({
        deviceId: 'local',
        trigger: 'manual',
        storageType: 'github-repo',
      }),
      historyStore,
    });

    const result = await orchestrator.sync({
      profile: {
        type: 'github-repo',
        repoOwner: 'demo',
        repoName: 'bookmarkhub',
        repoBranch: 'main',
        repoFilePath: 'bookmarkhub/snapshot.json',
      },
      trigger: 'manual',
    });

    expect(adapter.writeCurrentSnapshot).toHaveBeenCalled();
    expect(historyStore.append).toHaveBeenCalled();
    expect(result.status).toBe('success');
  });
});
```

```typescript
// src/core/sync-v2/app/runtimeBridge.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSyncV2RuntimeBridge } from './runtimeBridge';

describe('createSyncV2RuntimeBridge', () => {
  it('routes syncV2 messages to the orchestrator', async () => {
    const sync = vi.fn().mockResolvedValue({ status: 'success' });
    const bridge = createSyncV2RuntimeBridge({
      sync,
      getHistory: vi.fn().mockResolvedValue([]),
      testConnection: vi.fn().mockResolvedValue({ ok: true }),
    });

    const response = await bridge.handleMessage({ name: 'syncV2', payload: { trigger: 'manual' } });

    expect(sync).toHaveBeenCalled();
    expect(response).toEqual({ status: 'success' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/sync-v2/app/orchestrator.test.ts src/core/sync-v2/app/runtimeBridge.test.ts`
Expected: FAIL with missing module errors

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/registry.ts
import { GithubRepoAdapter } from './githubRepoAdapter';
import { GistAdapter } from './gistAdapter';
import { WebdavAdapter } from './webdavAdapter';
import type { StorageAdapter, StorageProfile } from './types';

export function createStorageRegistry() {
  const adapters: Record<StorageProfile['type'], StorageAdapter> = {
    'github-repo': new GithubRepoAdapter(),
    'github-gist': new GistAdapter(),
    webdav: new WebdavAdapter(),
  };

  return {
    getAdapter(profile: StorageProfile): StorageAdapter {
      return adapters[profile.type];
    },
  };
}
```

```typescript
// src/core/sync-v2/app/orchestrator.ts
import { mergeSnapshots } from '../engine/merge';
import { createEmptySnapshot, type StorageType, type SyncHistoryEntry, type SyncTrigger } from '../domain';
import type { StorageProfile } from '../storage/types';

export function createSyncOrchestrator(input: {
  getAdapter: (profile: StorageProfile) => {
    readCurrentSnapshot: (profile: StorageProfile) => Promise<ReturnType<typeof createEmptySnapshot> | null>;
    writeCurrentSnapshot: (profile: StorageProfile, snapshot: ReturnType<typeof createEmptySnapshot>) => Promise<void>;
    appendHistory: (profile: StorageProfile, entry: SyncHistoryEntry) => Promise<void>;
  };
  getLocalSnapshot: (storageType: StorageType, trigger: SyncTrigger) => Promise<ReturnType<typeof createEmptySnapshot>>;
  historyStore: { append: (entry: SyncHistoryEntry) => Promise<void> };
}) {
  return {
    async sync(params: { profile: StorageProfile; trigger: SyncTrigger }) {
      const adapter = input.getAdapter(params.profile);
      const local = await input.getLocalSnapshot(params.profile.type, params.trigger);
      const remote = (await adapter.readCurrentSnapshot(params.profile)) ?? createEmptySnapshot({
        deviceId: 'remote-empty',
        trigger: params.trigger,
        storageType: params.profile.type,
      });
      const merged = mergeSnapshots(local, remote);
      const entry: SyncHistoryEntry = {
        sessionId: crypto.randomUUID(),
        createdAt: Date.now(),
        status: 'success',
        trigger: params.trigger,
        storageType: params.profile.type,
        summary: merged.summary,
      };

      await adapter.writeCurrentSnapshot(params.profile, merged.snapshot);
      await adapter.appendHistory(params.profile, entry);
      await input.historyStore.append(entry);

      return {
        status: 'success' as const,
        summary: merged.summary,
      };
    },
  };
}
```

```typescript
// src/core/sync-v2/app/runtimeBridge.ts
export function createSyncV2RuntimeBridge(input: {
  sync: (payload: unknown) => Promise<unknown>;
  getHistory: () => Promise<unknown>;
  testConnection: (payload: unknown) => Promise<unknown>;
}) {
  return {
    async handleMessage(message: { name: string; payload?: unknown }) {
      if (message.name === 'syncV2') return input.sync(message.payload);
      if (message.name === 'getSyncV2History') return input.getHistory();
      if (message.name === 'testSyncV2Connection') return input.testConnection(message.payload);
      return undefined;
    },
  };
}
```

```typescript
// src/entrypoints/background.ts
import { createStorageRegistry } from '@/core/sync-v2/storage/registry';
import { createHistoryStore } from '@/core/sync-v2/app/historyStore';
import { createSyncOrchestrator } from '@/core/sync-v2/app/orchestrator';
import { createSyncV2RuntimeBridge } from '@/core/sync-v2/app/runtimeBridge';

const syncV2Bridge = createSyncV2RuntimeBridge({
  sync: payload => orchestrator.sync(payload as never),
  getHistory: () => historyStore.list(),
  testConnection: async payload => {
    const adapter = registry.getAdapter((payload as { profile: never }).profile);
    await adapter.connect((payload as { profile: never }).profile);
    return { ok: true };
  },
});

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.name === 'syncV2' || msg.name === 'getSyncV2History' || msg.name === 'testSyncV2Connection') {
    syncV2Bridge.handleMessage(msg).then(sendResponse);
    return true;
  }

  return false;
});
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/core/sync-v2/app/orchestrator.test.ts src/core/sync-v2/app/runtimeBridge.test.ts`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/registry.ts src/core/sync-v2/app/orchestrator.ts src/core/sync-v2/app/orchestrator.test.ts src/core/sync-v2/app/runtimeBridge.ts src/core/sync-v2/app/runtimeBridge.test.ts src/entrypoints/background.ts
git commit -m "feat: wire sync v2 orchestrator into background runtime"
```

---

## Task 8: Replace the Popup with the MVP Status Panel

**Files:**
- Create: `src/entrypoints/popup/popup.test.tsx`
- Modify: `src/entrypoints/popup/popup.tsx`
- Modify: `src/entrypoints/popup/popup.css`

- [ ] **Step 1: Write the failing test**

```tsx
// src/entrypoints/popup/popup.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Popup from './popup';

describe('Popup', () => {
  beforeEach(() => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      syncV2LastResult: {
        status: 'success',
        summary: { added: 1, removed: 0, modified: 0, conflicts: 0 },
      },
    });
  });

  it('shows the last result and triggers syncV2', async () => {
    render(<Popup />);

    await screen.findByText('Last sync');
    fireEvent.click(screen.getByRole('button', { name: 'Start Sync' }));

    await waitFor(() => {
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ name: 'syncV2', payload: { trigger: 'manual' } });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entrypoints/popup/popup.test.tsx`
Expected: FAIL because `Popup` is not exported as a component and the button text does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/entrypoints/popup/popup.tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css';

type LastResult = {
  status: 'success' | 'failed';
  summary: { added: number; removed: number; modified: number; conflicts: number };
};

const Popup: React.FC = () => {
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  useEffect(() => {
    browser.storage.local.get('syncV2LastResult').then(data => {
      setLastResult((data.syncV2LastResult as LastResult | undefined) ?? null);
    });
  }, []);

  const handleSync = async () => {
    await browser.runtime.sendMessage({ name: 'syncV2', payload: { trigger: 'manual' } });
  };

  return (
    <div className="popup-panel">
      <h1 className="popup-title">BookmarkHub v2</h1>
      <div className="popup-card">
        <h2>Last sync</h2>
        <p>{lastResult ? lastResult.status : 'Never'}</p>
        <p>
          Added {lastResult?.summary.added ?? 0} / Removed {lastResult?.summary.removed ?? 0} / Modified {lastResult?.summary.modified ?? 0}
        </p>
      </div>
      <button className="btn btn-primary w-100" onClick={handleSync}>
        Start Sync
      </button>
    </div>
  );
};

export default Popup;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
```

```css
/* src/entrypoints/popup/popup.css */
.popup-panel {
  width: 320px;
  padding: 16px;
}

.popup-title {
  font-size: 20px;
  margin-bottom: 12px;
}

.popup-card {
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  background: #f8fafc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/entrypoints/popup/popup.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/popup/popup.tsx src/entrypoints/popup/popup.css src/entrypoints/popup/popup.test.tsx
git commit -m "feat: add sync v2 popup status panel"
```

---

## Task 9: Rebuild the Options Page for MVP Storage Profiles

**Files:**
- Create: `src/entrypoints/options/options.test.tsx`
- Modify: `src/entrypoints/options/options.tsx`
- Modify: `src/entrypoints/options/options.css`

- [ ] **Step 1: Write the failing test**

```tsx
// src/entrypoints/options/options.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Options from './options';

describe('Options', () => {
  beforeEach(() => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({ ok: true });
  });

  it('shows GitHub repo fields when repo storage is selected and tests the connection', async () => {
    render(<Options />);

    fireEvent.change(screen.getByLabelText('Storage Type'), {
      target: { value: 'github-repo' },
    });

    expect(screen.getByLabelText('Repository Owner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));

    await waitFor(() => {
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'testSyncV2Connection' }),
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entrypoints/options/options.test.tsx`
Expected: FAIL because the MVP storage type selector and connection test action do not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/entrypoints/options/options.tsx
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css';

const Options: React.FC = () => {
  const [storageType, setStorageType] = useState<'github-repo' | 'github-gist' | 'webdav'>('github-repo');
  const [form, setForm] = useState({
    repoOwner: '',
    repoName: '',
    repoBranch: 'main',
    repoFilePath: 'bookmarkhub/snapshot.json',
    gistId: '',
    gistFileName: 'BookmarkHub',
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
    webdavPath: '/bookmarkhub/snapshot.json',
  });

  const handleTestConnection = async () => {
    await browser.runtime.sendMessage({
      name: 'testSyncV2Connection',
      payload: {
        profile:
          storageType === 'github-repo'
            ? {
                type: storageType,
                repoOwner: form.repoOwner,
                repoName: form.repoName,
                repoBranch: form.repoBranch,
                repoFilePath: form.repoFilePath,
              }
            : storageType === 'github-gist'
              ? {
                  type: storageType,
                  gistId: form.gistId,
                  gistFileName: form.gistFileName,
                }
              : {
                  type: storageType,
                  webdavUrl: form.webdavUrl,
                  webdavUsername: form.webdavUsername,
                  webdavPassword: form.webdavPassword,
                  webdavPath: form.webdavPath,
                },
      },
    });
  };

  return (
    <div className="options-page container py-4">
      <h1 className="mb-4">BookmarkHub v2 Settings</h1>

      <label className="form-label" htmlFor="storageType">
        Storage Type
      </label>
      <select
        id="storageType"
        className="form-select mb-3"
        value={storageType}
        onChange={event => setStorageType(event.target.value as 'github-repo' | 'github-gist' | 'webdav')}
      >
        <option value="github-repo">GitHub Repo</option>
        <option value="github-gist">GitHub Gist</option>
        <option value="webdav">WebDAV</option>
      </select>

      {storageType === 'github-repo' && (
        <section className="settings-card">
          <label className="form-label">Repository Owner</label>
          <input className="form-control mb-2" aria-label="Repository Owner" />
          <label className="form-label">Repository Name</label>
          <input className="form-control" aria-label="Repository Name" />
        </section>
      )}

      <button className="btn btn-outline-primary mt-3" onClick={handleTestConnection}>
        Test Connection
      </button>
    </div>
  );
};

export default Options;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>,
);
```

```css
/* src/entrypoints/options/options.css */
.options-page {
  max-width: 840px;
}

.settings-card {
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  padding: 16px;
  background: #ffffff;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/entrypoints/options/options.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/options/options.tsx src/entrypoints/options/options.css src/entrypoints/options/options.test.tsx
git commit -m "feat: add sync v2 options storage profiles"
```

---

## Task 10: Run Full MVP Verification and Record the Manual Checks

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md`

- [ ] **Step 1: Add the manual verification checklist to the bottom of this plan**

```markdown
## Manual Verification Checklist

- [ ] Chrome dev build opens and popup renders the MVP panel
- [ ] Firefox dev build opens and popup renders the MVP panel
- [ ] GitHub Repo connection test succeeds with a real repository
- [ ] Gist connection test succeeds with a real gist
- [ ] WebDAV connection test succeeds with a real WebDAV endpoint
- [ ] Manual sync writes a snapshot and appends one history entry
- [ ] Basic history list updates after a successful sync
- [ ] Legacy popup import/export actions still work if intentionally retained
```

- [ ] **Step 2: Run the full automated verification**

Run: `npm run compile`
Expected: PASS

Run: `npm test`
Expected: PASS with all existing tests plus the new v2 and UI tests

Run: `npm run build`
Expected: PASS with `.output/` generated successfully

- [ ] **Step 3: Perform the manual checks**

Run: `npm run dev`
Expected: Chrome build loads, popup and options render, manual sync flow is reachable

Run: `npm run dev:firefox`
Expected: Firefox build loads, popup and options render, manual sync flow is reachable

- [ ] **Step 4: Commit the MVP branch after verification**

```bash
git add src/core/sync-v2 src/entrypoints/background.ts src/entrypoints/popup src/entrypoints/options src/utils/constants.ts src/utils/optionsStorage.ts src/utils/setting.ts docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md
git commit -m "feat: ship bookmarkhub sync v2 mvp"
```

## Manual Verification Checklist

- [ ] Chrome dev build opens and popup renders the MVP panel
- [ ] Firefox dev build opens and popup renders the MVP panel
- [ ] GitHub Repo connection test succeeds with a real repository
- [ ] Gist connection test succeeds with a real gist
- [ ] WebDAV connection test succeeds with a real WebDAV endpoint
- [ ] Manual sync writes a snapshot and appends one history entry
- [ ] Basic history list updates after a successful sync
- [ ] Legacy popup import/export actions still work if intentionally retained

---

## Spec Coverage Self-Check

- `Phase 0`: covered by Tasks 1-2 and the file structure section.
- `Phase 1`: covered by Tasks 3-10.
- `GitHub Repo / Gist / WebDAV`: covered by Tasks 3-5.
- `Manual sync`: covered by Tasks 7-10.
- `Add/delete/modify merge`: covered by Task 6.
- `Basic history`: covered by Tasks 6-7 and the UI tasks.
- `Popup MVP`: covered by Task 8.
- `Options MVP`: covered by Task 9.
- `Chrome / Firefox validation`: covered by Task 10.

Gaps intentionally left for follow-up plans:

- Encryption
- Automatic sync
- Forced sync
- Full time-machine restore
- OAuth-backed storage
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

Plan complete and saved to `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

# BookmarkHub v2 Diagnostics and Time Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Release 3 product-parity capabilities to BookmarkHub v2: richer sync diagnostics, GitHub-backed time-machine restore for `GitHub Repo / Gist`, and explicit history-only treatment for `WebDAV`.

**Architecture:** Build Release 3 on top of the Release 1 history store and the Release 2 secure/automatic runtime. Use local history for recent run diagnostics, and use GitHub-native revision APIs for full restore points on `GitHub Repo / Gist` so the extension does not need to fake time-machine support on every backend. Keep restore execution as a separate `history/` service instead of bloating the main sync orchestrator.

**Tech Stack:** WXT 0.19, React 18, TypeScript, Vitest, Testing Library, browser.storage API, browser.runtime messaging, GitHub REST API (`commits`, `contents`, `gists`)

---

## Prerequisite Gate

Do not execute this plan until the Release 1 and Release 2 child plans have verified cleanly:

- [2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md)
- [2026-04-18-bookmarkhub-v2-security-and-automation-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-security-and-automation-plan.md)

Required prerequisite evidence:

- `npm run compile` passes on the Release 2 branch
- `npm test` passes on the Release 2 branch
- `npm run build` passes on the Release 2 branch
- Chrome and Firefox manual Release 2 checks are complete

Run before starting Release 3:

```bash
npm run compile
npm test
npm run build
```

Expected:

- All three commands exit `0`

---

## Scope Guard

This plan adds only these Release 3 features:

- Richer diagnostics based on recent sync runs and backend capabilities
- Options-page diagnostics panel
- Full time-machine restore for `GitHub Repo / Gist`
- Restore preview before execution
- Popup summary of the latest diagnostic state
- Explicit unsupported-state UX for `WebDAV`

Do not pull these into Release 3:

- `Gitee / GitLab / S3 / Google Drive / OneDrive`
- OAuth authorization state
- Move detection
- Conflict visualization
- Merge-result replay
- Full time-machine restore on `WebDAV`

If one of those becomes necessary, stop and write the next release plan instead of expanding this one.

---

## File Structure

### New files

- `src/core/sync-v2/app/diagnostics.ts`
  - Builds the UI-facing diagnostics payload from history, runtime state, and storage capabilities.
- `src/core/sync-v2/app/diagnostics.test.ts`
  - Diagnostics aggregation tests.
- `src/core/sync-v2/history/restorePlanner.ts`
  - Pure restore-preview logic that compares the current snapshot with a restore-point snapshot.
- `src/core/sync-v2/history/restorePlanner.test.ts`
  - Preview-diff tests.
- `src/core/sync-v2/history/timeMachine.ts`
  - Lists restore points, previews them, and executes a restore as a new history event.
- `src/core/sync-v2/history/timeMachine.test.ts`
  - Restore flow tests.

### Existing files to modify

- `src/core/sync-v2/domain.ts`
  - Extend v2 domain types with restore-point and diagnostics models.
- `src/core/sync-v2/storage/types.ts`
  - Extend storage capabilities and adapter contracts for time-machine access.
- `src/core/sync-v2/storage/types.test.ts`
  - Verify backend capability flags.
- `src/core/sync-v2/storage/githubRepoAdapter.ts`
  - Add restore-point listing and snapshot reads by commit `ref`.
- `src/core/sync-v2/storage/githubRepoAdapter.test.ts`
  - Cover repository commit-based restore points.
- `src/core/sync-v2/storage/gistAdapter.ts`
  - Add restore-point listing and revision reads through gist history APIs.
- `src/core/sync-v2/storage/gistAdapter.test.ts`
  - Cover gist revision-based restore points.
- `src/core/sync-v2/storage/webdavAdapter.ts`
  - Return no restore points and preserve history-only behavior.
- `src/core/sync-v2/storage/webdavAdapter.test.ts`
  - Assert that `WebDAV` remains time-machine-disabled.
- `src/core/sync-v2/storage/registry.ts`
  - Surface adapter capabilities to diagnostics and restore services.
- `src/core/sync-v2/app/historyStore.ts`
  - Expose recent-history filtering helpers if the existing `list()` API is insufficient.
- `src/core/sync-v2/app/runtimeBridge.ts`
  - Add runtime actions for diagnostics and restore-point flows.
- `src/core/sync-v2/app/runtimeBridge.test.ts`
  - Verify the new runtime actions route correctly.
- `src/entrypoints/background.ts`
  - Instantiate diagnostics and time-machine services and route runtime messages.
- `src/entrypoints/popup/popup.tsx`
  - Show last-run health and direct the user to diagnostics.
- `src/entrypoints/popup/popup.test.tsx`
  - Cover popup diagnostics state rendering.
- `src/entrypoints/options/options.tsx`
  - Add diagnostics panel, restore-point list, preview modal, and restore action.
- `src/entrypoints/options/options.test.tsx`
  - Cover diagnostics and restore interactions.
- `src/public/_locales/en/messages.json`
  - Add Release 3 user-facing strings.
- `src/public/_locales/zh_CN/messages.json`
  - Add Release 3 user-facing strings for the main Chinese locale.

---

## Task 1: Extend the Domain Model and Storage Capabilities

**Files:**
- Modify: `src/core/sync-v2/domain.ts`
- Modify: `src/core/sync-v2/storage/types.ts`
- Modify: `src/core/sync-v2/storage/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/types.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_STORAGE_CAPABILITIES } from './types';

describe('DEFAULT_STORAGE_CAPABILITIES', () => {
  it('marks github-backed storage as time-machine capable', () => {
    expect(DEFAULT_STORAGE_CAPABILITIES['github-repo'].supportsTimeMachine).toBe(true);
    expect(DEFAULT_STORAGE_CAPABILITIES['github-gist'].supportsTimeMachine).toBe(true);
  });

  it('keeps webdav history-only in release 3', () => {
    expect(DEFAULT_STORAGE_CAPABILITIES.webdav.supportsBasicHistory).toBe(true);
    expect(DEFAULT_STORAGE_CAPABILITIES.webdav.supportsTimeMachine).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/storage/types.test.ts`
Expected: FAIL with `Property 'supportsTimeMachine' does not exist`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/domain.ts
export interface SyncHistoryEntry {
  sessionId: string;
  createdAt: number;
  status: 'success' | 'failed';
  trigger: SyncTrigger;
  storageType: StorageType;
  summary: SyncSummary;
  operation?: 'sync' | 'restore';
  mode?: 'normal' | 'force';
  durationMs?: number;
  revisionId?: string;
  restorePointId?: string;
  errorMessage?: string;
}

export interface RestorePointSummary {
  id: string;
  revisionId: string;
  label: string;
  createdAt: number;
  storageType: Extract<StorageType, 'github-repo' | 'github-gist'>;
}

export interface RestorePreview {
  restorePointId: string;
  revisionId: string;
  currentBookmarkCount: number;
  targetBookmarkCount: number;
  summary: SyncSummary;
  warnings: string[];
}

export interface SyncDiagnosticsSnapshot {
  latestRuns: SyncHistoryEntry[];
  latestSuccessfulRun: SyncHistoryEntry | null;
  latestFailedRun: SyncHistoryEntry | null;
  encryptionEnabled: boolean;
  capabilities: {
    supportsBasicHistory: boolean;
    supportsTimeMachine: boolean;
  };
  warnings: string[];
}
```

```typescript
// src/core/sync-v2/storage/types.ts
import type {
  BookmarkSnapshot,
  RestorePointSummary,
  StorageType,
  SyncHistoryEntry,
} from '../domain';

export interface StorageCapabilities {
  supportsBasicHistory: boolean;
  supportsTimeMachine: boolean;
}

export interface StorageAdapter {
  connect(profile: StorageProfile): Promise<void>;
  readCurrentSnapshot(profile: StorageProfile, options?: SnapshotWriteOptions): Promise<BookmarkSnapshot | null>;
  writeCurrentSnapshot(profile: StorageProfile, snapshot: BookmarkSnapshot, options?: SnapshotWriteOptions): Promise<void>;
  appendHistory(profile: StorageProfile, entry: SyncHistoryEntry, options?: SnapshotWriteOptions): Promise<void>;
  deleteRemoteData(profile: StorageProfile): Promise<void>;
  listRestorePoints(profile: StorageProfile): Promise<RestorePointSummary[]>;
  readRestorePoint(
    profile: StorageProfile,
    restorePointId: string,
    options?: SnapshotWriteOptions,
  ): Promise<BookmarkSnapshot>;
}

export const DEFAULT_STORAGE_CAPABILITIES: Record<StorageType, StorageCapabilities> = {
  'github-repo': {
    supportsBasicHistory: true,
    supportsTimeMachine: true,
  },
  'github-gist': {
    supportsBasicHistory: true,
    supportsTimeMachine: true,
  },
  webdav: {
    supportsBasicHistory: true,
    supportsTimeMachine: false,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/storage/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/domain.ts src/core/sync-v2/storage/types.ts src/core/sync-v2/storage/types.test.ts
git commit -m "feat: add release 3 restore and diagnostics types"
```

---

## Task 2: Add GitHub Repository Restore-Point Support

**Files:**
- Modify: `src/core/sync-v2/storage/githubRepoAdapter.ts`
- Modify: `src/core/sync-v2/storage/githubRepoAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/githubRepoAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GithubRepoAdapter } from './githubRepoAdapter';
import { createEmptySnapshot } from '../domain';

describe('githubRepoAdapter time machine', () => {
  it('lists restore points from repository commits and reads a snapshot by commit sha', async () => {
    const snapshot = createEmptySnapshot({
      deviceId: 'chrome',
      trigger: 'manual',
      storageType: 'github-repo',
    });

    const http = {
      get: vi
        .fn()
        .mockReturnValueOnce({
          json: async () => [
            {
              sha: 'abc1234',
              commit: {
                message: 'sync: snapshot abc1234',
                author: { date: '2026-04-18T09:00:00Z' },
              },
            },
          ],
        })
        .mockReturnValueOnce({
          json: async () => ({
            content: btoa(JSON.stringify(snapshot)),
          }),
        }),
    };

    const adapter = new GithubRepoAdapter(http as never);
    const profile = {
      type: 'github-repo',
      repoOwner: 'muyu',
      repoName: 'bookmarkhub-sync',
      repoBranch: 'main',
      repoFilePath: 'sync/snapshot.json',
      token: 'token',
    };

    const points = await adapter.listRestorePoints(profile);
    const restored = await adapter.readRestorePoint(profile, 'abc1234');

    expect(points[0].revisionId).toBe('abc1234');
    expect(restored.storageType).toBe('github-repo');
    expect(http.get).toHaveBeenNthCalledWith(
      1,
      'repos/muyu/bookmarkhub-sync/commits',
      expect.objectContaining({
        searchParams: expect.objectContaining({
          path: 'sync/snapshot.json',
          per_page: 20,
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/storage/githubRepoAdapter.test.ts`
Expected: FAIL with `adapter.listRestorePoints is not a function`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/githubRepoAdapter.ts
import { http } from '@/utils/http';
import type { BookmarkSnapshot, RestorePointSummary, SyncHistoryEntry } from '../domain';
import type { GithubRepoProfile, SnapshotWriteOptions, StorageAdapter } from './types';

function decodeContent<T>(content: string): T {
  return JSON.parse(atob(content.replace(/\n/g, ''))) as T;
}

export class GithubRepoAdapter implements StorageAdapter {
  constructor(private httpClient: typeof http = http) {}

  async connect(profile: GithubRepoProfile): Promise<void> {
    await this.httpClient.get(`repos/${profile.repoOwner}/${profile.repoName}`);
  }

  async readCurrentSnapshot(
    profile: GithubRepoProfile,
    _options?: SnapshotWriteOptions,
  ): Promise<BookmarkSnapshot | null> {
    const response = await this.httpClient
      .get(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`, {
        searchParams: { ref: profile.repoBranch },
      })
      .json<{ content: string }>();
    return decodeContent<BookmarkSnapshot>(response.content);
  }

  async writeCurrentSnapshot(
    profile: GithubRepoProfile,
    snapshot: BookmarkSnapshot,
    _options?: SnapshotWriteOptions,
  ): Promise<void> {
    await this.httpClient.put(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`, {
      json: {
        branch: profile.repoBranch,
        message: `sync: snapshot ${snapshot.createdAt}`,
        content: btoa(JSON.stringify(snapshot, null, 2)),
      },
    });
  }

  async appendHistory(
    profile: GithubRepoProfile,
    entry: SyncHistoryEntry,
    _options?: SnapshotWriteOptions,
  ): Promise<void> {
    const historyPath = profile.repoFilePath.replace('snapshot.json', 'history.json');
    await this.httpClient.put(`repos/${profile.repoOwner}/${profile.repoName}/contents/${historyPath}`, {
      json: {
        branch: profile.repoBranch,
        message: `sync: append history ${entry.sessionId}`,
        content: btoa(JSON.stringify([entry], null, 2)),
      },
    });
  }

  async deleteRemoteData(profile: GithubRepoProfile): Promise<void> {
    await this.httpClient.delete(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`);
  }

  async listRestorePoints(profile: GithubRepoProfile): Promise<RestorePointSummary[]> {
    const commits = await this.httpClient
      .get(`repos/${profile.repoOwner}/${profile.repoName}/commits`, {
        searchParams: {
          path: profile.repoFilePath,
          sha: profile.repoBranch,
          per_page: 20,
        },
      })
      .json<Array<{ sha: string; commit: { message: string; author: { date: string } } }>>();

    return commits.map(commit => ({
      id: commit.sha,
      revisionId: commit.sha,
      label: commit.commit.message || `Snapshot ${commit.sha.slice(0, 7)}`,
      createdAt: Date.parse(commit.commit.author.date),
      storageType: 'github-repo',
    }));
  }

  async readRestorePoint(
    profile: GithubRepoProfile,
    restorePointId: string,
    _options?: SnapshotWriteOptions,
  ): Promise<BookmarkSnapshot> {
    const response = await this.httpClient
      .get(`repos/${profile.repoOwner}/${profile.repoName}/contents/${profile.repoFilePath}`, {
        searchParams: {
          ref: restorePointId,
        },
      })
      .json<{ content: string }>();

    return decodeContent<BookmarkSnapshot>(response.content);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/storage/githubRepoAdapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/githubRepoAdapter.ts src/core/sync-v2/storage/githubRepoAdapter.test.ts
git commit -m "feat: add github repo restore-point support"
```

---

## Task 3: Add Gist Restore-Point Support and Preserve WebDAV History-Only Behavior

**Files:**
- Modify: `src/core/sync-v2/storage/gistAdapter.ts`
- Modify: `src/core/sync-v2/storage/gistAdapter.test.ts`
- Modify: `src/core/sync-v2/storage/webdavAdapter.ts`
- Modify: `src/core/sync-v2/storage/webdavAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/storage/gistAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GistAdapter } from './gistAdapter';
import { createEmptySnapshot } from '../domain';

describe('gistAdapter time machine', () => {
  it('lists restore points from gist history and reads a specific revision', async () => {
    const snapshot = createEmptySnapshot({
      deviceId: 'firefox',
      trigger: 'manual',
      storageType: 'github-gist',
    });

    const http = {
      get: vi
        .fn()
        .mockReturnValueOnce({
          json: async () => ({
            history: [
              {
                version: 'rev-001',
                committed_at: '2026-04-18T08:00:00Z',
              },
            ],
          }),
        })
        .mockReturnValueOnce({
          json: async () => ({
            files: {
              'BookmarkHub.json': {
                content: JSON.stringify(snapshot),
              },
            },
          }),
        }),
    };

    const adapter = new GistAdapter(http as never);
    const profile = {
      type: 'github-gist',
      gistId: 'gist-1',
      gistFileName: 'BookmarkHub',
      token: 'token',
    };

    const points = await adapter.listRestorePoints(profile);
    const restored = await adapter.readRestorePoint(profile, 'rev-001');

    expect(points[0].revisionId).toBe('rev-001');
    expect(restored.deviceId).toBe('firefox');
  });
});
```

```typescript
// src/core/sync-v2/storage/webdavAdapter.test.ts
import { describe, expect, it } from 'vitest';
import { WebdavAdapter } from './webdavAdapter';

describe('webdavAdapter release 3 scope', () => {
  it('exposes no restore points and stays history-only', async () => {
    const adapter = new WebdavAdapter();
    const profile = {
      type: 'webdav',
      webdavUrl: 'https://dav.example.com',
      webdavUsername: 'demo',
      webdavPassword: 'secret',
      webdavPath: '/bookmarkhub/snapshot.json',
    };

    await expect(adapter.listRestorePoints(profile)).resolves.toEqual([]);
    await expect(adapter.readRestorePoint(profile, 'any')).rejects.toThrow('Time machine is not supported for WebDAV');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/sync-v2/storage/gistAdapter.test.ts src/core/sync-v2/storage/webdavAdapter.test.ts`
Expected: FAIL with missing `listRestorePoints` or `readRestorePoint`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/storage/gistAdapter.ts
import { http } from '@/utils/http';
import type { BookmarkSnapshot, RestorePointSummary, SyncHistoryEntry } from '../domain';
import type { GithubGistProfile, SnapshotWriteOptions, StorageAdapter } from './types';

export class GistAdapter implements StorageAdapter {
  constructor(private httpClient: typeof http = http) {}

  async connect(profile: GithubGistProfile): Promise<void> {
    await this.httpClient.get(`gists/${profile.gistId}`);
  }

  async readCurrentSnapshot(
    profile: GithubGistProfile,
    _options?: SnapshotWriteOptions,
  ): Promise<BookmarkSnapshot | null> {
    const gist = await this.httpClient.get(`gists/${profile.gistId}`).json<{
      files: Record<string, { content?: string }>;
    }>();
    const raw = gist.files[`${profile.gistFileName}.json`]?.content;
    return raw ? (JSON.parse(raw) as BookmarkSnapshot) : null;
  }

  async writeCurrentSnapshot(
    profile: GithubGistProfile,
    snapshot: BookmarkSnapshot,
    _options?: SnapshotWriteOptions,
  ): Promise<void> {
    await this.httpClient.patch(`gists/${profile.gistId}`, {
      json: {
        files: {
          [`${profile.gistFileName}.json`]: {
            content: JSON.stringify(snapshot, null, 2),
          },
        },
      },
    });
  }

  async appendHistory(
    profile: GithubGistProfile,
    entry: SyncHistoryEntry,
    _options?: SnapshotWriteOptions,
  ): Promise<void> {
    await this.httpClient.patch(`gists/${profile.gistId}`, {
      json: {
        files: {
          [`${profile.gistFileName}.history.json`]: {
            content: JSON.stringify([entry], null, 2),
          },
        },
      },
    });
  }

  async deleteRemoteData(profile: GithubGistProfile): Promise<void> {
    await this.httpClient.patch(`gists/${profile.gistId}`, {
      json: {
        files: {
          [`${profile.gistFileName}.json`]: null,
          [`${profile.gistFileName}.history.json`]: null,
        },
      },
    });
  }

  async listRestorePoints(profile: GithubGistProfile): Promise<RestorePointSummary[]> {
    const gist = await this.httpClient.get(`gists/${profile.gistId}`).json<{
      history: Array<{ version: string; committed_at: string }>;
    }>();

    return gist.history.map(item => ({
      id: item.version,
      revisionId: item.version,
      label: `Revision ${item.version.slice(0, 7)}`,
      createdAt: Date.parse(item.committed_at),
      storageType: 'github-gist',
    }));
  }

  async readRestorePoint(
    profile: GithubGistProfile,
    restorePointId: string,
    _options?: SnapshotWriteOptions,
  ): Promise<BookmarkSnapshot> {
    const revision = await this.httpClient.get(`gists/${profile.gistId}/${restorePointId}`).json<{
      files: Record<string, { content?: string }>;
    }>();
    const raw = revision.files[`${profile.gistFileName}.json`]?.content;

    if (!raw) {
      throw new Error(`Missing snapshot file for gist revision ${restorePointId}`);
    }

    return JSON.parse(raw) as BookmarkSnapshot;
  }
}
```

```typescript
// src/core/sync-v2/storage/webdavAdapter.ts
import { WebDAVClient } from '@/utils/webdav';
import type { BookmarkSnapshot, SyncHistoryEntry } from '../domain';
import type { SnapshotWriteOptions, StorageAdapter, WebdavProfile } from './types';

export class WebdavAdapter implements StorageAdapter {
  private createClient(profile: WebdavProfile): WebDAVClient {
    return new WebDAVClient(profile.webdavUrl, profile.webdavUsername, profile.webdavPassword);
  }

  async connect(profile: WebdavProfile): Promise<void> {
    const client = this.createClient(profile);
    await client.exists(profile.webdavPath);
  }

  async readCurrentSnapshot(
    profile: WebdavProfile,
    _options?: SnapshotWriteOptions,
  ): Promise<BookmarkSnapshot | null> {
    const client = this.createClient(profile);
    const raw = await client.read(profile.webdavPath);
    return raw ? (JSON.parse(raw) as BookmarkSnapshot) : null;
  }

  async writeCurrentSnapshot(
    profile: WebdavProfile,
    snapshot: BookmarkSnapshot,
    _options?: SnapshotWriteOptions,
  ): Promise<void> {
    const client = this.createClient(profile);
    const ok = await client.write(profile.webdavPath, JSON.stringify(snapshot, null, 2), 'application/json');
    if (!ok) {
      throw new Error('WebDAV snapshot write failed');
    }
  }

  async appendHistory(
    profile: WebdavProfile,
    entry: SyncHistoryEntry,
    _options?: SnapshotWriteOptions,
  ): Promise<void> {
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

  async listRestorePoints(): Promise<[]> {
    return [];
  }

  async readRestorePoint(
    _profile: WebdavProfile,
    _restorePointId: string,
    _options?: SnapshotWriteOptions,
  ): Promise<never> {
    throw new Error('Time machine is not supported for WebDAV');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/sync-v2/storage/gistAdapter.test.ts src/core/sync-v2/storage/webdavAdapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/storage/gistAdapter.ts src/core/sync-v2/storage/gistAdapter.test.ts src/core/sync-v2/storage/webdavAdapter.ts src/core/sync-v2/storage/webdavAdapter.test.ts
git commit -m "feat: add gist restore points and lock webdav history-only scope"
```

---

## Task 4: Build Restore Preview and Time-Machine Execution Services

**Files:**
- Create: `src/core/sync-v2/history/restorePlanner.ts`
- Create: `src/core/sync-v2/history/restorePlanner.test.ts`
- Create: `src/core/sync-v2/history/timeMachine.ts`
- Create: `src/core/sync-v2/history/timeMachine.test.ts`
- Modify: `src/core/sync-v2/app/historyStore.ts`
- Modify: `src/core/sync-v2/storage/registry.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/sync-v2/history/restorePlanner.test.ts
import { describe, expect, it } from 'vitest';
import { buildRestorePreview } from './restorePlanner';
import { createEmptySnapshot } from '../domain';

describe('buildRestorePreview', () => {
  it('summarizes add, delete, and modify counts before restore', () => {
    const current = createEmptySnapshot({
      deviceId: 'chrome',
      trigger: 'manual',
      storageType: 'github-repo',
    });
    current.root.children = [{ id: 'a', title: 'A', type: 'bookmark', url: 'https://a.com' }];

    const target = createEmptySnapshot({
      deviceId: 'chrome',
      trigger: 'manual',
      storageType: 'github-repo',
    });
    target.root.children = [{ id: 'a', title: 'A+', type: 'bookmark', url: 'https://a.com' }];

    const preview = buildRestorePreview({
      restorePointId: 'abc1234',
      revisionId: 'abc1234',
      current,
      target,
    });

    expect(preview.summary.modified).toBe(1);
    expect(preview.restorePointId).toBe('abc1234');
  });
});
```

```typescript
// src/core/sync-v2/history/timeMachine.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createTimeMachineService } from './timeMachine';
import { createEmptySnapshot } from '../domain';

describe('timeMachineService', () => {
  it('restores a selected restore point and appends a restore history entry', async () => {
    const target = createEmptySnapshot({
      deviceId: 'chrome',
      trigger: 'manual',
      storageType: 'github-repo',
    });

    const adapter = {
      listRestorePoints: vi.fn().mockResolvedValue([]),
      readRestorePoint: vi.fn().mockResolvedValue(target),
      writeCurrentSnapshot: vi.fn().mockResolvedValue(undefined),
      appendHistory: vi.fn().mockResolvedValue(undefined),
    };

    const historyStore = {
      append: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    };

    const service = createTimeMachineService({
      getAdapter: () => adapter as never,
      getCurrentSnapshot: async () => createEmptySnapshot({
        deviceId: 'chrome',
        trigger: 'manual',
        storageType: 'github-repo',
      }),
      getSnapshotOptions: async () => ({}),
      historyStore,
      now: () => 1713420000000,
    });

    await service.restore({
      profile: {
        type: 'github-repo',
      } as never,
      restorePointId: 'abc1234',
    });

    expect(adapter.readRestorePoint).toHaveBeenCalledWith(expect.anything(), 'abc1234', {});
    expect(adapter.writeCurrentSnapshot).toHaveBeenCalled();
    expect(historyStore.append).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'restore',
        restorePointId: 'abc1234',
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/sync-v2/history/restorePlanner.test.ts src/core/sync-v2/history/timeMachine.test.ts`
Expected: FAIL with missing modules

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/history/restorePlanner.ts
import type { BookmarkNode, BookmarkSnapshot, RestorePreview } from '../domain';

function flatten(nodes: BookmarkNode[]): Map<string, BookmarkNode> {
  const map = new Map<string, BookmarkNode>();

  const walk = (items: BookmarkNode[]) => {
    for (const node of items) {
      map.set(node.id, node);
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return map;
}

export function buildRestorePreview(input: {
  restorePointId: string;
  revisionId: string;
  current: BookmarkSnapshot;
  target: BookmarkSnapshot;
}): RestorePreview {
  const currentNodes = flatten(input.current.root.children);
  const targetNodes = flatten(input.target.root.children);

  let added = 0;
  let deleted = 0;
  let modified = 0;

  for (const [id, targetNode] of targetNodes.entries()) {
    const currentNode = currentNodes.get(id);
    if (!currentNode) {
      added += 1;
      continue;
    }

    if (currentNode.title !== targetNode.title || currentNode.url !== targetNode.url) {
      modified += 1;
    }
  }

  for (const id of currentNodes.keys()) {
    if (!targetNodes.has(id)) {
      deleted += 1;
    }
  }

  return {
    restorePointId: input.restorePointId,
    revisionId: input.revisionId,
    currentBookmarkCount: currentNodes.size,
    targetBookmarkCount: targetNodes.size,
    summary: {
      added,
      removed: deleted,
      modified,
      conflicts: 0,
    },
    warnings: deleted > 0 ? ['Restore will remove bookmarks that were added after this restore point.'] : [],
  };
}
```

```typescript
// src/core/sync-v2/history/timeMachine.ts
import { buildRestorePreview } from './restorePlanner';
import type { BookmarkSnapshot, RestorePointSummary, StorageType, SyncHistoryEntry } from '../domain';
import type { SnapshotWriteOptions, StorageProfile } from '../storage/types';

export function createTimeMachineService(input: {
  getAdapter: (profile: StorageProfile) => {
    listRestorePoints: (profile: StorageProfile) => Promise<RestorePointSummary[]>;
    readRestorePoint: (
      profile: StorageProfile,
      restorePointId: string,
      options?: SnapshotWriteOptions,
    ) => Promise<BookmarkSnapshot>;
    writeCurrentSnapshot: (
      profile: StorageProfile,
      snapshot: BookmarkSnapshot,
      options?: SnapshotWriteOptions,
    ) => Promise<void>;
    appendHistory: (
      profile: StorageProfile,
      entry: SyncHistoryEntry,
      options?: SnapshotWriteOptions,
    ) => Promise<void>;
  };
  getCurrentSnapshot: (storageType: StorageType) => Promise<BookmarkSnapshot>;
  getSnapshotOptions: (profile: StorageProfile, payload?: { passphrase?: string }) => Promise<SnapshotWriteOptions>;
  historyStore: {
    append: (entry: SyncHistoryEntry) => Promise<void>;
    list: () => Promise<SyncHistoryEntry[]>;
  };
  now?: () => number;
}) {
  const now = input.now ?? Date.now;

  return {
    async listRestorePoints(params: { profile: StorageProfile }): Promise<RestorePointSummary[]> {
      return input.getAdapter(params.profile).listRestorePoints(params.profile);
    },

    async preview(params: { profile: StorageProfile; restorePointId: string; passphrase?: string }) {
      const adapter = input.getAdapter(params.profile);
      const current = await input.getCurrentSnapshot(params.profile.type);
      const accessOptions = await input.getSnapshotOptions(params.profile, params);
      const target = await adapter.readRestorePoint(params.profile, params.restorePointId, accessOptions);

      return buildRestorePreview({
        restorePointId: params.restorePointId,
        revisionId: params.restorePointId,
        current,
        target,
      });
    },

    async restore(params: { profile: StorageProfile; restorePointId: string; passphrase?: string }) {
      const adapter = input.getAdapter(params.profile);
      const accessOptions = await input.getSnapshotOptions(params.profile, params);
      const preview = await this.preview(params);
      const target = await adapter.readRestorePoint(params.profile, params.restorePointId, accessOptions);

      await adapter.writeCurrentSnapshot(params.profile, target, accessOptions);

      const entry: SyncHistoryEntry = {
        sessionId: `restore-${params.restorePointId}`,
        createdAt: now(),
        status: 'success',
        trigger: 'manual',
        storageType: params.profile.type,
        summary: preview.summary,
        operation: 'restore',
        mode: 'normal',
        restorePointId: params.restorePointId,
        revisionId: params.restorePointId,
      };

      await adapter.appendHistory(params.profile, entry, accessOptions);
      await input.historyStore.append(entry);

      return entry;
    },
  };
}
```

```typescript
// src/core/sync-v2/storage/registry.ts
import { GithubRepoAdapter } from './githubRepoAdapter';
import { GistAdapter } from './gistAdapter';
import { WebdavAdapter } from './webdavAdapter';
import { DEFAULT_STORAGE_CAPABILITIES, type StorageAdapter, type StorageProfile } from './types';

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
    getCapabilities(storageType: StorageProfile['type']) {
      return DEFAULT_STORAGE_CAPABILITIES[storageType];
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/sync-v2/history/restorePlanner.test.ts src/core/sync-v2/history/timeMachine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/history/restorePlanner.ts src/core/sync-v2/history/restorePlanner.test.ts src/core/sync-v2/history/timeMachine.ts src/core/sync-v2/history/timeMachine.test.ts src/core/sync-v2/storage/registry.ts
git commit -m "feat: add restore preview and time machine services"
```

---

## Task 5: Add Diagnostics Aggregation and Runtime Actions

**Files:**
- Create: `src/core/sync-v2/app/diagnostics.ts`
- Create: `src/core/sync-v2/app/diagnostics.test.ts`
- Modify: `src/core/sync-v2/app/historyStore.ts`
- Modify: `src/core/sync-v2/app/runtimeBridge.ts`
- Modify: `src/core/sync-v2/app/runtimeBridge.test.ts`
- Modify: `src/entrypoints/background.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/sync-v2/app/diagnostics.test.ts
import { describe, expect, it } from 'vitest';
import { createDiagnosticsService } from './diagnostics';

describe('diagnosticsService', () => {
  it('surfaces the latest failure and backend capability warnings', async () => {
    const diagnostics = createDiagnosticsService({
      listHistory: async () => [
        {
          sessionId: 'failed-1',
          createdAt: 1713420000000,
          status: 'failed',
          trigger: 'manual',
          storageType: 'webdav',
          summary: { added: 0, removed: 0, modified: 0, conflicts: 0 },
          operation: 'sync',
          errorMessage: '401 Unauthorized',
        },
      ],
      getCapabilities: () => ({
        supportsBasicHistory: true,
        supportsTimeMachine: false,
      }),
      isEncryptionEnabled: async () => false,
    });

    const panel = await diagnostics.getSnapshot('webdav');

    expect(panel.latestFailedRun?.errorMessage).toBe('401 Unauthorized');
    expect(panel.warnings).toContain('Time machine is not available for this backend.');
    expect(panel.encryptionEnabled).toBe(false);
  });
});
```

```typescript
// src/core/sync-v2/app/runtimeBridge.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSyncV2RuntimeBridge } from './runtimeBridge';

describe('createSyncV2RuntimeBridge release 3', () => {
  it('routes diagnostics and restore messages', async () => {
    const getDiagnostics = vi.fn().mockResolvedValue({});
    const listRestorePoints = vi.fn().mockResolvedValue([]);
    const previewRestorePoint = vi.fn().mockResolvedValue({});
    const restoreRestorePoint = vi.fn().mockResolvedValue({});

    const bridge = createSyncV2RuntimeBridge({
      sync: vi.fn(),
      getHistory: vi.fn(),
      getDiagnostics,
      listRestorePoints,
      previewRestorePoint,
      restoreRestorePoint,
      testConnection: vi.fn(),
      forceSync: vi.fn(),
      deleteRemote: vi.fn(),
    });

    await bridge.handleMessage({ name: 'getSyncV2Diagnostics' });
    await bridge.handleMessage({ name: 'getSyncV2RestorePoints' });
    await bridge.handleMessage({ name: 'previewSyncV2RestorePoint', payload: { restorePointId: 'abc1234' } });
    await bridge.handleMessage({ name: 'restoreSyncV2RestorePoint', payload: { restorePointId: 'abc1234' } });

    expect(getDiagnostics).toHaveBeenCalled();
    expect(listRestorePoints).toHaveBeenCalled();
    expect(previewRestorePoint).toHaveBeenCalledWith({ restorePointId: 'abc1234' });
    expect(restoreRestorePoint).toHaveBeenCalledWith({ restorePointId: 'abc1234' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/sync-v2/app/diagnostics.test.ts src/core/sync-v2/app/runtimeBridge.test.ts`
Expected: FAIL with missing module or missing message routes

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/app/diagnostics.ts
import type { StorageType, SyncDiagnosticsSnapshot, SyncHistoryEntry } from '../domain';
import type { StorageCapabilities } from '../storage/types';

export function createDiagnosticsService(input: {
  listHistory: () => Promise<SyncHistoryEntry[]>;
  getCapabilities: (storageType: StorageType) => StorageCapabilities;
  isEncryptionEnabled: (storageType: StorageType) => Promise<boolean>;
}) {
  return {
    async getSnapshot(storageType: StorageType): Promise<SyncDiagnosticsSnapshot> {
      const latestRuns = (await input.listHistory())
        .filter(entry => entry.storageType === storageType)
        .slice(0, 10);
      const latestSuccessfulRun = latestRuns.find(entry => entry.status === 'success') ?? null;
      const latestFailedRun = latestRuns.find(entry => entry.status === 'failed') ?? null;
      const capabilities = input.getCapabilities(storageType);
      const encryptionEnabled = await input.isEncryptionEnabled(storageType);
      const warnings: string[] = [];

      if (!capabilities.supportsTimeMachine) {
        warnings.push('Time machine is not available for this backend.');
      }

      if (latestFailedRun?.errorMessage) {
        warnings.push(latestFailedRun.errorMessage);
      }

      return {
        latestRuns,
        latestSuccessfulRun,
        latestFailedRun,
        encryptionEnabled,
        capabilities,
        warnings,
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
  getDiagnostics: () => Promise<unknown>;
  listRestorePoints: () => Promise<unknown>;
  previewRestorePoint: (payload: unknown) => Promise<unknown>;
  restoreRestorePoint: (payload: unknown) => Promise<unknown>;
  testConnection: (payload: unknown) => Promise<unknown>;
  forceSync: (payload: unknown) => Promise<unknown>;
  deleteRemote: (payload: unknown) => Promise<unknown>;
}) {
  return {
    async handleMessage(message: { name: string; payload?: unknown }) {
      if (message.name === 'syncV2') return input.sync(message.payload);
      if (message.name === 'getSyncV2History') return input.getHistory();
      if (message.name === 'getSyncV2Diagnostics') return input.getDiagnostics();
      if (message.name === 'getSyncV2RestorePoints') return input.listRestorePoints();
      if (message.name === 'previewSyncV2RestorePoint') return input.previewRestorePoint(message.payload);
      if (message.name === 'restoreSyncV2RestorePoint') return input.restoreRestorePoint(message.payload);
      if (message.name === 'testSyncV2Connection') return input.testConnection(message.payload);
      if (message.name === 'forceSyncV2') return input.forceSync(message.payload);
      if (message.name === 'deleteSyncV2Remote') return input.deleteRemote(message.payload);
      return undefined;
    },
  };
}
```

```typescript
// src/entrypoints/background.ts
import { createStorageRegistry } from '@/core/sync-v2/storage/registry';
import { createHistoryStore } from '@/core/sync-v2/app/historyStore';
import { createDiagnosticsService } from '@/core/sync-v2/app/diagnostics';
import { createTimeMachineService } from '@/core/sync-v2/history/timeMachine';
import { createSyncV2RuntimeBridge } from '@/core/sync-v2/app/runtimeBridge';
import type { BookmarkNode, BookmarkSnapshot, StorageType } from '@/core/sync-v2/domain';

function toBookmarkNode(node: browser.bookmarks.BookmarkTreeNode): BookmarkNode {
  return {
    id: node.id,
    title: node.title,
    type: node.url ? 'bookmark' : 'folder',
    url: node.url,
    children: node.children?.map(toBookmarkNode),
  };
}

async function getCurrentLocalSnapshot(storageType: StorageType): Promise<BookmarkSnapshot> {
  const [rootNode] = await browser.bookmarks.getTree();

  return {
    schemaVersion: 1,
    deviceId: browser.runtime.id,
    trigger: 'manual',
    storageType,
    createdAt: Date.now(),
    root: toBookmarkNode(rootNode),
    summary: {
      added: 0,
      removed: 0,
      modified: 0,
      conflicts: 0,
    },
  };
}

const storageRegistry = createStorageRegistry();
const historyStore = createHistoryStore({ limit: 20 });
const diagnostics = createDiagnosticsService({
  listHistory: () => historyStore.list(),
  getCapabilities: storageType => storageRegistry.getCapabilities(storageType),
  isEncryptionEnabled: async () => {
    const setting = await Setting.build();
    return setting.syncV2EncryptionEnabled;
  },
});
const timeMachine = createTimeMachineService({
  getAdapter: profile => storageRegistry.getAdapter(profile),
  getCurrentSnapshot: getCurrentLocalSnapshot,
  getSnapshotOptions: async (_profile, payload) => ({
    passphrase: payload?.passphrase,
  }),
  historyStore,
});

const syncV2Bridge = createSyncV2RuntimeBridge({
  sync: payload => orchestrator.sync(payload as never),
  getHistory: () => historyStore.list(),
  getDiagnostics: async () => {
    const setting = await Setting.build();
    const profile = buildSyncV2ProfileFromSetting(setting);
    return diagnostics.getSnapshot(profile.type);
  },
  listRestorePoints: async () => {
    const setting = await Setting.build();
    const profile = buildSyncV2ProfileFromSetting(setting);
    return timeMachine.listRestorePoints({ profile });
  },
  previewRestorePoint: async payload => {
    const setting = await Setting.build();
    const profile = buildSyncV2ProfileFromSetting(setting);
    return timeMachine.preview({ profile, ...(payload as { restorePointId: string }) });
  },
  restoreRestorePoint: async payload => {
    const setting = await Setting.build();
    const profile = buildSyncV2ProfileFromSetting(setting);
    return timeMachine.restore({ profile, ...(payload as { restorePointId: string }) });
  },
  testConnection: payload => testSyncV2Connection(payload as never),
  forceSync: payload => orchestrator.sync({ ...(payload as object), mode: 'force' } as never),
  deleteRemote: payload => deleteRemoteFlow.run(payload as never),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/sync-v2/app/diagnostics.test.ts src/core/sync-v2/app/runtimeBridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/app/diagnostics.ts src/core/sync-v2/app/diagnostics.test.ts src/core/sync-v2/app/runtimeBridge.ts src/core/sync-v2/app/runtimeBridge.test.ts src/entrypoints/background.ts
git commit -m "feat: add sync v2 diagnostics and restore runtime actions"
```

---

## Task 6: Expose Diagnostics and Time Machine in Popup and Options

**Files:**
- Modify: `src/entrypoints/popup/popup.tsx`
- Modify: `src/entrypoints/popup/popup.test.tsx`
- Modify: `src/entrypoints/options/options.tsx`
- Modify: `src/entrypoints/options/options.test.tsx`
- Modify: `src/public/_locales/en/messages.json`
- Modify: `src/public/_locales/zh_CN/messages.json`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/entrypoints/options/options.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Options from './options';

describe('Options release 3 panels', () => {
  it('shows diagnostics warnings and a restore timeline entry', async () => {
    vi.spyOn(browser.runtime, 'sendMessage')
      .mockResolvedValueOnce({
        latestRuns: [],
        latestSuccessfulRun: null,
        latestFailedRun: {
          errorMessage: '401 Unauthorized',
        },
        encryptionEnabled: false,
        capabilities: {
          supportsBasicHistory: true,
          supportsTimeMachine: true,
        },
        warnings: ['401 Unauthorized'],
      })
      .mockResolvedValueOnce([
        {
          id: 'abc1234',
          revisionId: 'abc1234',
          label: 'sync: snapshot abc1234',
          createdAt: 1713420000000,
          storageType: 'github-repo',
        },
      ]);

    render(<Options />);

    await waitFor(() => {
      expect(screen.getByText('401 Unauthorized')).toBeInTheDocument();
      expect(screen.getByText('sync: snapshot abc1234')).toBeInTheDocument();
    });
  });
});
```

```typescript
// src/entrypoints/popup/popup.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Popup from './popup';

describe('Popup release 3 summary', () => {
  it('shows the latest failed diagnostic summary', async () => {
    vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
      latestRuns: [],
      latestSuccessfulRun: null,
      latestFailedRun: {
        errorMessage: 'Decrypt failed',
      },
      encryptionEnabled: true,
      capabilities: {
        supportsBasicHistory: true,
        supportsTimeMachine: true,
      },
      warnings: ['Decrypt failed'],
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText('Decrypt failed')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/entrypoints/popup/popup.test.tsx src/entrypoints/options/options.test.tsx`
Expected: FAIL because diagnostics and restore sections are not rendered yet

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/entrypoints/popup/popup.tsx
const [diagnostics, setDiagnostics] = useState<null | {
  latestFailedRun: { errorMessage?: string } | null;
  latestSuccessfulRun: { createdAt: number } | null;
  warnings: string[];
}>(null);

useEffect(() => {
  browser.runtime.sendMessage({ name: 'getSyncV2Diagnostics' }).then(setDiagnostics);
}, []);

<section className="status-card mt-3">
  <h2 className="h6 mb-2">{browser.i18n.getMessage('syncDiagnostics') || 'Sync Diagnostics'}</h2>
  {diagnostics?.latestFailedRun?.errorMessage ? (
    <p className="text-danger mb-2">{diagnostics.latestFailedRun.errorMessage}</p>
  ) : diagnostics?.latestSuccessfulRun ? (
    <p className="text-success mb-2">
      {browser.i18n.getMessage('lastHealthySync') || 'Last healthy sync'}:{' '}
      {new Date(diagnostics.latestSuccessfulRun.createdAt).toLocaleString()}
    </p>
  ) : (
    <p className="text-muted mb-2">{browser.i18n.getMessage('noDiagnosticData') || 'No diagnostic data yet.'}</p>
  )}
  <button className="btn btn-outline-secondary btn-sm" onClick={() => browser.runtime.openOptionsPage()}>
    {browser.i18n.getMessage('openDiagnostics') || 'Open Diagnostics'}
  </button>
</section>
```

```tsx
// src/entrypoints/options/options.tsx
const [diagnostics, setDiagnostics] = useState<any>(null);
const [restorePoints, setRestorePoints] = useState<any[]>([]);
const [restorePreview, setRestorePreview] = useState<any>(null);
const [restorePassphrase, setRestorePassphrase] = useState('');
const [showRestorePreview, setShowRestorePreview] = useState(false);

useEffect(() => {
  browser.runtime.sendMessage({ name: 'getSyncV2Diagnostics' }).then(setDiagnostics);
  browser.runtime.sendMessage({ name: 'getSyncV2RestorePoints' }).then(setRestorePoints);
}, []);

const handlePreviewRestore = async (restorePointId: string) => {
  const preview = await browser.runtime.sendMessage({
    name: 'previewSyncV2RestorePoint',
    payload: { restorePointId, passphrase: restorePassphrase || undefined },
  });
  setRestorePreview(preview);
  setShowRestorePreview(true);
};

const confirmRestorePoint = async () => {
  if (!restorePreview) return;
  await browser.runtime.sendMessage({
    name: 'restoreSyncV2RestorePoint',
    payload: { restorePointId: restorePreview.restorePointId, passphrase: restorePassphrase || undefined },
  });
  setShowRestorePreview(false);
};

<Card className="mb-3">
  <Card.Header>{browser.i18n.getMessage('syncDiagnostics') || 'Sync Diagnostics'}</Card.Header>
  <Card.Body>
    {diagnostics?.warnings?.length ? (
      diagnostics.warnings.map((warning: string) => (
        <p key={warning} className="text-danger mb-2">{warning}</p>
      ))
    ) : (
      <p className="text-muted mb-2">{browser.i18n.getMessage('diagnosticsHealthy') || 'No active sync issues detected.'}</p>
    )}
  </Card.Body>
</Card>

<Card className="mb-3">
  <Card.Header>{browser.i18n.getMessage('timeMachine') || 'Time Machine'}</Card.Header>
  <Card.Body>
    {diagnostics?.capabilities?.supportsTimeMachine ? (
      restorePoints.length ? (
        <Table striped bordered hover size="sm">
          <tbody>
            {restorePoints.map(point => (
              <tr key={point.id}>
                <td>{point.label}</td>
                <td>{new Date(point.createdAt).toLocaleString()}</td>
                <td>
                  <Button size="sm" variant="outline-primary" onClick={() => handlePreviewRestore(point.id)}>
                    {browser.i18n.getMessage('previewRestore') || 'Preview Restore'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-muted mb-0">{browser.i18n.getMessage('noRestorePoints') || 'No restore points yet.'}</p>
      )
    ) : (
      <p className="text-muted mb-0">
        {browser.i18n.getMessage('timeMachineUnsupported') || 'This backend supports history only. Full time machine is unavailable.'}
      </p>
    )}
  </Card.Body>
</Card>

<Modal show={showRestorePreview} onHide={() => setShowRestorePreview(false)}>
  <Modal.Header closeButton>
    <Modal.Title>{browser.i18n.getMessage('restorePreview') || 'Restore Preview'}</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    {restorePreview && (
      <>
        {diagnostics?.encryptionEnabled && (
          <>
            <label className="form-label">{browser.i18n.getMessage('restorePassphrase') || 'Restore Passphrase'}</label>
            <input
              className="form-control mb-3"
              type="password"
              value={restorePassphrase}
              onChange={event => setRestorePassphrase(event.target.value)}
            />
          </>
        )}
        <p>{browser.i18n.getMessage('restoreAdded') || 'Added'}: {restorePreview.summary.added}</p>
        <p>{browser.i18n.getMessage('restoreDeleted') || 'Deleted'}: {restorePreview.summary.removed}</p>
        <p>{browser.i18n.getMessage('restoreModified') || 'Modified'}: {restorePreview.summary.modified}</p>
      </>
    )}
  </Modal.Body>
  <Modal.Footer>
    <Button variant="secondary" onClick={() => setShowRestorePreview(false)}>
      {browser.i18n.getMessage('cancel') || 'Cancel'}
    </Button>
    <Button variant="primary" onClick={confirmRestorePoint}>
      {browser.i18n.getMessage('restoreNow') || 'Restore Now'}
    </Button>
  </Modal.Footer>
</Modal>
```

```json
// src/public/_locales/en/messages.json
{
  "syncDiagnostics": { "message": "Sync Diagnostics" },
  "openDiagnostics": { "message": "Open Diagnostics" },
  "diagnosticsHealthy": { "message": "No active sync issues detected." },
  "noDiagnosticData": { "message": "No diagnostic data yet." },
  "lastHealthySync": { "message": "Last healthy sync" },
  "timeMachine": { "message": "Time Machine" },
  "timeMachineUnsupported": { "message": "This backend supports history only. Full time machine is unavailable." },
  "previewRestore": { "message": "Preview Restore" },
  "restorePreview": { "message": "Restore Preview" },
  "restoreNow": { "message": "Restore Now" },
  "restorePassphrase": { "message": "Restore Passphrase" },
  "noRestorePoints": { "message": "No restore points yet." },
  "restoreAdded": { "message": "Added" },
  "restoreDeleted": { "message": "Deleted" },
  "restoreModified": { "message": "Modified" }
}
```

```json
// src/public/_locales/zh_CN/messages.json
{
  "syncDiagnostics": { "message": "同步诊断" },
  "openDiagnostics": { "message": "打开诊断面板" },
  "diagnosticsHealthy": { "message": "当前没有检测到同步异常。" },
  "noDiagnosticData": { "message": "暂时还没有诊断数据。" },
  "lastHealthySync": { "message": "最近一次健康同步" },
  "timeMachine": { "message": "书签时光机" },
  "timeMachineUnsupported": { "message": "当前后端仅支持基础历史，不支持完整时光机恢复。" },
  "previewRestore": { "message": "预览恢复" },
  "restorePreview": { "message": "恢复预览" },
  "restoreNow": { "message": "立即恢复" },
  "restorePassphrase": { "message": "恢复口令" },
  "noRestorePoints": { "message": "还没有可用的恢复点。" },
  "restoreAdded": { "message": "将新增" },
  "restoreDeleted": { "message": "将删除" },
  "restoreModified": { "message": "将修改" }
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/entrypoints/popup/popup.test.tsx src/entrypoints/options/options.test.tsx`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/popup/popup.tsx src/entrypoints/popup/popup.test.tsx src/entrypoints/options/options.tsx src/entrypoints/options/options.test.tsx src/public/_locales/en/messages.json src/public/_locales/zh_CN/messages.json
git commit -m "feat: add sync v2 diagnostics and time machine ui"
```

---

## Task 7: Run Full Release 3 Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md`

- [ ] **Step 1: Add the manual verification checklist to the bottom of this plan**

```markdown
## Manual Verification Checklist

- [ ] Options diagnostics panel shows recent warnings and latest successful run
- [ ] Popup shows either the last failure or the latest healthy-sync summary
- [ ] GitHub Repo restore points load from repository commit history
- [ ] Gist restore points load from gist revision history
- [ ] Restore preview shows add/delete/modify counts before confirmation
- [ ] Confirmed restore writes a new current snapshot and appends a restore history entry
- [ ] `WebDAV` still shows sync history but displays a disabled time-machine message
- [ ] Chrome and Firefox both render the Release 3 panels without layout regressions
```

- [ ] **Step 2: Run the full automated verification**

Run: `npm run compile`
Expected: PASS

Run: `npm test`
Expected: PASS with Release 1, Release 2, and Release 3 tests all green

Run: `npm run build`
Expected: PASS with `.output/` generated successfully

- [ ] **Step 3: Perform the manual checks**

Run: `npm run dev`
Expected: Chrome build loads, diagnostics and restore panels render, GitHub-backed restore flows are reachable

Run: `npm run dev:firefox`
Expected: Firefox build loads, diagnostics and restore panels render, GitHub-backed restore flows are reachable

- [ ] **Step 4: Commit the Release 3 branch after verification**

```bash
git add src/core/sync-v2 src/entrypoints/background.ts src/entrypoints/popup src/entrypoints/options src/public/_locales/en/messages.json src/public/_locales/zh_CN/messages.json docs/superpowers/plans/2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md
git commit -m "feat: ship bookmarkhub v2 release 3 diagnostics and time machine"
```

---

## Spec Coverage Self-Check

- Richer sync history: covered by Tasks 4-6.
- Diagnostics panel: covered by Tasks 5-6.
- Full time-machine restore for `GitHub Repo / Gist`: covered by Tasks 2-4 and Task 6.
- Restore preview before execution: covered by Tasks 4 and 6.
- `WebDAV` remains history-only: covered by Tasks 1, 3, and 6.
- Popup diagnostics summary: covered by Task 6.
- Release 3 verification: covered by Task 7.

Gaps intentionally left for later release plans:

- `Gitee / GitLab / S3 / Google Drive / OneDrive`
- OAuth control plane
- Move detection
- Conflict visualization
- Merge-result replay

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

Plan complete and saved to `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

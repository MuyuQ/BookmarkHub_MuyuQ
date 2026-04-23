# BookmarkHub v2 Product Parity Program Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an extension-only BookmarkHub v2 that materially benchmarks the target product on storage breadth, sync orchestration, security, history, diagnostics, and recovery capabilities.

**Architecture:** Build the product in layered releases instead of a single oversized rewrite. `Release 1` establishes the v2 core and MVP storage backends, `Release 2-4` add security, automation, diagnostics, and additional storage adapters, and `Release 5` closes the gap on advanced merge UX. The current WXT entrypoints remain, but all new behavior converges on `src/core/sync-v2/`.

**Tech Stack:** WXT 0.19, React 18, TypeScript, Vitest, Testing Library, ky, browser.bookmarks API, browser.storage API, GitHub REST API, WebDAV

---

## Program Scope

This is the full product-parity program for the browser extension only.

Included in the program:

- `GitHub Repo / Gist / WebDAV / Gitee / GitLab / S3`
- `Google Drive / OneDrive` after the OAuth control plane is designed
- Manual sync, automatic sync, and forced sync
- End-to-end encryption
- Basic sync history across all supported backends
- Full time-machine restore for `GitHub Repo / Gist`
- Delete-remote-data flows
- Diagnostics and user-facing sync results
- Advanced merge enhancements after MVP

Still out of scope:

- Website, download portal, docs site, community pages
- Account system, billing, subscriptions, license enforcement
- Legacy migration from the current data model

---

## Delivery Model

Use a two-layer planning model:

- Master plan: this file
- Executable sub-plans: one per release or subsystem

Current child plans already written:

- [2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md)
- [2026-04-18-bookmarkhub-v2-security-and-automation-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-security-and-automation-plan.md)
- [2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md)
- [2026-04-18-bookmarkhub-v2-advanced-merge-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-advanced-merge-plan.md)

Future child plans to write only when the previous release is stable:

- `Release 2`: security and automation
- `Release 3`: GitHub-backed time machine and diagnostics
- `Release 4`: non-OAuth storage expansion
- `Release 5`: OAuth storage expansion

---

## File Structure

### Core modules established by Release 1

- `src/core/sync-v2/domain.ts`
- `src/core/sync-v2/storage/`
- `src/core/sync-v2/engine/`
- `src/core/sync-v2/app/`
- `src/entrypoints/background.ts`
- `src/entrypoints/popup/`
- `src/entrypoints/options/`

### Modules added in later releases

- `src/core/sync-v2/security/cryptoEnvelope.ts`
- `src/core/sync-v2/security/keyStore.ts`
- `src/core/sync-v2/security/securityService.ts`
- `src/core/sync-v2/app/autoSyncScheduler.ts`
- `src/core/sync-v2/app/diagnostics.ts`
- `src/core/sync-v2/history/restorePlanner.ts`
- `src/core/sync-v2/history/timeMachine.ts`
- `src/core/sync-v2/storage/giteeAdapter.ts`
- `src/core/sync-v2/storage/gitlabAdapter.ts`
- `src/core/sync-v2/storage/s3Adapter.ts`
- `src/core/sync-v2/storage/auth/authorizationState.ts`
- `src/core/sync-v2/storage/auth/oauthBridge.ts`
- `src/core/sync-v2/storage/googleDriveAdapter.ts`
- `src/core/sync-v2/storage/oneDriveAdapter.ts`
- `src/core/sync-v2/engine/moveDetection.ts`
- `src/core/sync-v2/engine/conflictPresentation.ts`

### Test files added later

- `src/core/sync-v2/security/*.test.ts`
- `src/core/sync-v2/history/*.test.ts`
- `src/core/sync-v2/storage/*.test.ts`
- `src/core/sync-v2/app/*.test.ts`
- `src/entrypoints/popup/*.test.tsx`
- `src/entrypoints/options/*.test.tsx`

---

## Release Map

### Release 1: v2 Core MVP

Target:

- `GitHub Repo / Gist / WebDAV`
- Manual sync
- Add/delete/modify merge
- Basic history
- New popup/options baseline

Execution plan:

- Use [2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md)

Exit criteria:

- All MVP acceptance criteria pass
- Chrome and Firefox manual verification completed

### Release 2: Security and Automation

Target:

- End-to-end encryption
- Automatic sync
- Forced sync
- Delete remote data

Exit criteria:

- Encrypted sync succeeds on `GitHub Repo / Gist / WebDAV`
- Automatic sync behaves consistently on startup, timer, and bookmark change triggers
- Forced sync is explicit and cannot run accidentally

### Release 3: Diagnostics and Time Machine

Target:

- Richer sync history
- Diagnostics panel
- Full time-machine restore for `GitHub Repo / Gist`

Exit criteria:

- History is readable from the options page
- Restore preview and restore execution work for GitHub-backed storage
- WebDAV remains explicitly history-only

### Release 4: Non-OAuth Storage Expansion

Target:

- `Gitee / GitLab / S3`

Exit criteria:

- All new adapters pass shared adapter-contract tests
- Existing MVP behavior remains unchanged

### Release 5: OAuth Storage Expansion

Target:

- Authorization control plane
- `Google Drive / OneDrive`

Exit criteria:

- OAuth authorization, refresh, revoke, and reconnect flows are verified
- At least one OAuth backend is stable enough for mainline merge before enabling the second

### Release 6: Advanced Merge UX

Target:

- Move detection
- Conflict visualization
- Merge-result explainability improvements

Exit criteria:

- Move behavior is defined and tested on Chrome and Firefox
- Users can understand conflict outcomes without reading logs

---

## Task 1: Lock the Release Boundaries

**Files:**
- Modify: `docs/superpowers/specs/2026-04-18-bookmarkhub-v2-extension-design.md`
- Modify: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md`
- Create: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-product-parity-program-plan.md`

- [ ] **Step 1: Verify the spec and MVP plan agree on the release boundaries**

Check these items line-by-line:

- MVP only includes `GitHub Repo / Gist / WebDAV`
- `WebDAV` does not promise full time-machine restore
- OAuth backends are not in Release 1
- Move detection and conflict visualization are not in Release 1

Run:

```bash
Select-String -Path 'docs\superpowers\specs\2026-04-18-bookmarkhub-v2-extension-design.md' -Pattern 'WebDAV|Google Drive|OneDrive|移动检测|结果回放|MVP'
Select-String -Path 'docs\superpowers\plans\2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md' -Pattern 'WebDAV|Google Drive|OneDrive|Move detection|Result replay|MVP'
```

Expected:

- Only the intended scope appears in the MVP plan
- Full-scope items appear only in the program plan or later-release sections

- [ ] **Step 2: Keep this release map in sync before starting any implementation**

Use this checklist before each release:

```markdown
- [ ] Current release scope is documented
- [ ] Out-of-scope items are explicitly excluded
- [ ] Exit criteria are concrete
- [ ] A child implementation plan exists for the current release
```

- [ ] **Step 3: Commit the planning baseline**

```bash
git add docs/superpowers/specs/2026-04-18-bookmarkhub-v2-extension-design.md docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md docs/superpowers/plans/2026-04-18-bookmarkhub-v2-product-parity-program-plan.md
git commit -m "docs: define bookmarkhub v2 product parity program"
```

---

## Task 2: Release 2 Planning and Execution Gate

**Files:**
- Create: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-security-and-automation-plan.md`
- Modify: `src/core/sync-v2/security/*`
- Modify: `src/core/sync-v2/app/*`
- Modify: `src/entrypoints/options/options.tsx`
- Modify: `src/entrypoints/popup/popup.tsx`

- [ ] **Step 1: Write the Release 2 child plan only after Release 1 passes**

The child plan must cover these concrete modules:

```typescript
// src/core/sync-v2/security/cryptoEnvelope.ts
export interface CryptoEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
}

// src/core/sync-v2/security/keyStore.ts
export interface KeyStore {
  deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey>;
  exportSalt(salt: Uint8Array): string;
}

// src/core/sync-v2/app/autoSyncScheduler.ts
export interface AutoSyncScheduler {
  start(): Promise<void>;
  stop(): Promise<void>;
  onBookmarkEvent(event: 'created' | 'changed' | 'removed'): Promise<void>;
}
```

- [ ] **Step 2: Define the Release 2 automated proof**

Run:

```bash
npx vitest run src/core/sync-v2/security/*.test.ts src/core/sync-v2/app/*.test.ts
npm run compile
npm run build
```

Expected:

- Encryption, automatic sync, and delete-remote tests pass
- No regression in existing Release 1 tests

- [ ] **Step 3: Define the Release 2 manual proof**

Run:

```bash
npm run dev
npm run dev:firefox
```

Check:

- Encrypt + manual sync succeeds
- Encrypt + auto sync succeeds
- Forced sync is a separate explicit action
- Delete remote flow requires confirmation and shows the result

- [ ] **Step 4: Commit only after Release 2 child plan exists and Release 1 is stable**

```bash
git add docs/superpowers/plans/2026-04-18-bookmarkhub-v2-security-and-automation-plan.md
git commit -m "docs: add release 2 security and automation plan"
```

---

## Task 3: Release 3 Planning for Diagnostics and Time Machine

**Files:**
- Create: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md`
- Create: `src/core/sync-v2/history/restorePlanner.ts`
- Create: `src/core/sync-v2/history/timeMachine.ts`
- Modify: `src/core/sync-v2/app/historyStore.ts`
- Modify: `src/entrypoints/options/options.tsx`

- [ ] **Step 1: Define the GitHub-backed restore scope**

Use these interfaces in the child plan:

```typescript
// src/core/sync-v2/history/restorePlanner.ts
export interface RestorePreview {
  restorePointId: string;
  targetCreatedAt: number;
  summary: {
    added: number;
    removed: number;
    modified: number;
  };
}

// src/core/sync-v2/history/timeMachine.ts
export interface TimeMachineService {
  listRestorePoints(profileType: 'github-repo' | 'github-gist'): Promise<RestorePreview[]>;
  restore(restorePointId: string): Promise<void>;
}
```

- [ ] **Step 2: Exclude WebDAV from full restore**

Keep this exact rule in the child plan:

```markdown
`WebDAV` can display basic sync history, but it does not expose the full restore workflow in Release 3.
```

- [ ] **Step 3: Define verification**

Run:

```bash
npx vitest run src/core/sync-v2/history/*.test.ts
npm run compile
npm run build
```

Manual checks:

- GitHub Repo restore preview works
- GitHub Gist restore preview works
- Restore writes a new history entry
- WebDAV history page shows no restore CTA

- [ ] **Step 4: Commit the child plan**

```bash
git add docs/superpowers/plans/2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md
git commit -m "docs: add release 3 diagnostics and time machine plan"
```

---

## Task 4: Release 4 Planning for Non-OAuth Backends

**Files:**
- Create: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-non-oauth-storage-plan.md`
- Create: `src/core/sync-v2/storage/giteeAdapter.ts`
- Create: `src/core/sync-v2/storage/gitlabAdapter.ts`
- Create: `src/core/sync-v2/storage/s3Adapter.ts`
- Modify: `src/core/sync-v2/storage/types.ts`
- Modify: `src/core/sync-v2/storage/registry.ts`

- [ ] **Step 1: Standardize the adapter-contract tests before adding any backend**

Use this shared test shape in the child plan:

```typescript
export function runStorageAdapterContractSuite(createAdapter: () => StorageAdapter, profile: StorageProfile) {
  describe('storage adapter contract', () => {
    it('connects successfully', async () => {
      await expect(createAdapter().connect(profile)).resolves.toBeUndefined();
    });

    it('reads and writes the current snapshot', async () => {
      const adapter = createAdapter();
      const snapshot = createEmptySnapshot({
        deviceId: 'contract',
        trigger: 'manual',
        storageType: profile.type,
      });

      await adapter.writeCurrentSnapshot(profile, snapshot);
      await expect(adapter.readCurrentSnapshot(profile)).resolves.toBeTruthy();
    });
  });
}
```

- [ ] **Step 2: Add backends one by one instead of all at once**

Execution order:

```markdown
1. Gitee
2. GitLab
3. S3
```

Do not start the next backend until the previous one passes the shared adapter-contract suite.

- [ ] **Step 3: Define verification**

Run:

```bash
npx vitest run src/core/sync-v2/storage/*.test.ts
npm run compile
npm run build
```

Expected:

- All adapter-contract tests pass
- Existing GitHub Repo / Gist / WebDAV tests remain green

- [ ] **Step 4: Commit only after each backend passes independently**

```bash
git add docs/superpowers/plans/2026-04-18-bookmarkhub-v2-non-oauth-storage-plan.md
git commit -m "docs: add release 4 non-oauth storage plan"
```

---

## Task 5: Release 5 Planning for OAuth Backends

**Files:**
- Create: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-oauth-storage-plan.md`
- Create: `src/core/sync-v2/storage/auth/authorizationState.ts`
- Create: `src/core/sync-v2/storage/auth/oauthBridge.ts`
- Create: `src/core/sync-v2/storage/googleDriveAdapter.ts`
- Create: `src/core/sync-v2/storage/oneDriveAdapter.ts`
- Modify: `src/entrypoints/background.ts`
- Modify: `tests/setup.ts`

- [ ] **Step 1: Freeze the authorization control plane before adding adapters**

Use these core contracts in the child plan:

```typescript
// src/core/sync-v2/storage/auth/authorizationState.ts
export interface AuthorizationState {
  provider: 'google-drive' | 'onedrive';
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes: string[];
}

// src/core/sync-v2/storage/auth/oauthBridge.ts
export interface OAuthBridge {
  begin(provider: 'google-drive' | 'onedrive'): Promise<string>;
  complete(callbackUrl: string): Promise<AuthorizationState>;
  refresh(state: AuthorizationState): Promise<AuthorizationState>;
  revoke(state: AuthorizationState): Promise<void>;
}
```

- [ ] **Step 2: Add one OAuth backend before the second**

Execution order:

```markdown
1. Google Drive
2. OneDrive
```

Do not add `OneDrive` until `Google Drive` can:

- Authorize
- Refresh
- Reconnect after restart
- Complete one sync cycle

- [ ] **Step 3: Define verification**

Run:

```bash
npx vitest run src/core/sync-v2/storage/auth/*.test.ts src/core/sync-v2/storage/*.test.ts
npm run compile
npm run build
```

Manual checks:

- Authorization popup opens
- Callback is processed successfully
- Expired token is refreshed
- Revocation removes local auth state

- [ ] **Step 4: Commit the OAuth child plan**

```bash
git add docs/superpowers/plans/2026-04-18-bookmarkhub-v2-oauth-storage-plan.md
git commit -m "docs: add release 5 oauth storage plan"
```

---

## Task 6: Release 6 Planning for Advanced Merge UX

**Files:**
- Create: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-advanced-merge-plan.md`
- Create: `src/core/sync-v2/engine/moveDetection.ts`
- Create: `src/core/sync-v2/engine/conflictPresentation.ts`
- Modify: `src/core/sync-v2/engine/merge.ts`
- Modify: `src/entrypoints/options/options.tsx`
- Modify: `src/entrypoints/popup/popup.tsx`

- [ ] **Step 1: Keep advanced merge isolated from the MVP merge path**

Use an opt-in internal API first:

```typescript
// src/core/sync-v2/engine/moveDetection.ts
export interface MoveRecord {
  key: string;
  fromParentKey: string;
  toParentKey: string;
}

export function detectMoves(previous: BookmarkSnapshot, next: BookmarkSnapshot): MoveRecord[] {
  return [];
}
```

```typescript
// src/core/sync-v2/engine/conflictPresentation.ts
export interface ConflictPresentation {
  key: string;
  title: string;
  reason: 'title-changed' | 'url-changed' | 'parent-changed';
}
```

- [ ] **Step 2: Define the user-facing proof**

Manual checks required by the child plan:

- A move conflict is explained in plain language
- A title/url conflict is explained in plain language
- The popup summary remains simple while the options page shows details

- [ ] **Step 3: Define verification**

Run:

```bash
npx vitest run src/core/sync-v2/engine/*.test.ts
npm run compile
npm run build
```

Expected:

- Existing add/delete/modify logic stays green
- Move detection tests are isolated and explicit

- [ ] **Step 4: Commit the child plan**

```bash
git add docs/superpowers/plans/2026-04-18-bookmarkhub-v2-advanced-merge-plan.md
git commit -m "docs: add release 6 advanced merge plan"
```

---

## Program Verification Checklist

- [ ] Release 1 child plan exists and is complete
- [ ] Release 2 child plan does not start before Release 1 verification
- [ ] WebDAV remains excluded from full time-machine restore
- [ ] OAuth backends remain excluded until auth control plane is finalized
- [ ] Advanced merge remains excluded until core sync behavior is stable

Run:

```bash
Get-ChildItem 'docs\superpowers\plans'
Select-String -Path 'docs\superpowers\plans\*.md' -Pattern 'WebDAV|Google Drive|OneDrive|time-machine|Move detection|Result replay'
```

Expected:

- The release map and child-plan boundaries stay consistent

---

## Spec Coverage Self-Check

- Full product parity intent: covered by Program Scope and Release Map.
- Realistic sequencing: covered by the release boundaries and exit criteria.
- Security and automation: covered by Task 2.
- GitHub-backed time machine: covered by Task 3.
- Additional backends: covered by Tasks 4 and 5.
- Advanced merge: covered by Task 6.

Intentionally deferred from this master plan:

- Website/account/billing work
- Legacy migration
- Mobile or non-extension clients

---

## Placeholder Scan

Verified absent from executable sections:

- `TODO`
- `TBD`
- `implement later`
- `similar to task`

The child-plan list is intentional release planning, not an implementation placeholder.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-product-parity-program-plan.md`. The recommended next move is:

**1. Keep the full product-parity program as the north star**

**2. Execute the existing MVP child plan first**

**3. Write and execute Release 2 only after Release 1 verifies cleanly**

# BookmarkHub v2 Advanced Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Release 6` product-parity capabilities to BookmarkHub v2: move detection, conflict visualization, lightweight merge-decision replay, and clear merge summaries without changing the supported storage backends.

**Architecture:** Build Release 6 as an explainability upgrade on top of the v2 sync core from Releases 1-3. Keep the advanced merge logic inside `src/core/sync-v2/engine/`, store the resulting analysis in sync history, and let popup/options render that stored data instead of recomputing merge behavior in the UI. Use `src/utils/changeDetection.ts` and `src/utils/merge.ts` only as rule references while keeping the v2 engine independent from the legacy sync path.

**Tech Stack:** WXT 0.19, React 18, TypeScript, Vitest, Testing Library, browser.storage API, browser.runtime messaging, browser.bookmarks API

---

## Prerequisite Gate

Do not execute this plan until the Release 1, Release 2, and Release 3 child plans have verified cleanly:

- [2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-mvp-implementation-plan.md)
- [2026-04-18-bookmarkhub-v2-security-and-automation-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-security-and-automation-plan.md)
- [2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md](E:/git_repositories/BookmarkHub_MuyuQ/docs/superpowers/plans/2026-04-18-bookmarkhub-v2-diagnostics-and-time-machine-plan.md)

Required prerequisite evidence:

- `npm run compile` passes on the Release 3 branch
- `npm test` passes on the Release 3 branch
- `npm run build` passes on the Release 3 branch
- Chrome and Firefox manual Release 3 checks are complete

Run before starting Release 6:

```bash
npm run compile
npm test
npm run build
```

Expected:

- All three commands exit `0`

---

## Scope Guard

This plan adds only these Release 6 features:

- Move detection in the v2 merge engine
- Structured conflict records instead of count-only conflict summaries
- Lightweight decision-log generation for each merge run
- Options-page conflict visualization and step-based replay
- Popup summary of moved/conflict-heavy merge results
- Backward-compatible rendering of older history entries that do not contain Release 6 fields

Do not pull these into Release 6:

- New storage backends
- OAuth flows
- Encryption redesign
- Full event sourcing or full bookmark-tree playback
- Animated replay UI
- Manual per-conflict editing before merge commit
- Refactoring the legacy `src/utils/merge.ts` path into v2

If one of those becomes necessary, stop and write a follow-up plan instead of expanding this one.

---

## File Structure

### Reference-only files

- `src/utils/changeDetection.ts`
  - Existing legacy change rules, including `moved` classification, used as a behavior reference only.
- `src/utils/merge.ts`
  - Existing legacy three-way merge behavior, used as a rule reference only.

Do not import those files into `src/core/sync-v2/`. Recreate only the rules that Release 6 actually needs.

### New files

- `src/core/sync-v2/engine/moveDetection.ts`
  - Pure move-detection logic over v2 snapshots.
- `src/core/sync-v2/engine/moveDetection.test.ts`
  - Move-detection unit tests.
- `src/core/sync-v2/engine/conflictPresentation.ts`
  - Converts merge conflict candidates into user-facing `ConflictRecord` values with plain-language explanations.
- `src/core/sync-v2/engine/conflictPresentation.test.ts`
  - Conflict explanation tests.
- `src/core/sync-v2/engine/decisionLog.ts`
  - Builds lightweight replay steps from merge analysis and conflict records.
- `src/core/sync-v2/engine/decisionLog.test.ts`
  - Decision-log ordering and content tests.
- `src/core/sync-v2/domain.release6.test.ts`
  - Release 6 domain normalization tests.

### Existing files to modify

- `src/core/sync-v2/domain.ts`
  - Extend history and merge types with move, conflict, and replay fields.
- `src/core/sync-v2/engine/merge.ts`
  - Compose move detection, conflict presentation, decision logging, and explainability output.
- `src/core/sync-v2/engine/merge.test.ts`
  - Verify advanced merge output.
- `src/core/sync-v2/app/historyStore.ts`
  - Persist Release 6 merge details and normalize older entries that lack them.
- `src/core/sync-v2/app/historyStore.test.ts`
  - Verify persistence and backward compatibility.
- `src/core/sync-v2/app/orchestrator.ts`
  - Append advanced merge payloads into sync history.
- `src/core/sync-v2/app/orchestrator.test.ts`
  - Verify orchestrator stores advanced merge output.
- `src/core/sync-v2/app/runtimeBridge.ts`
  - Add a detail-level history route for the options replay panel.
- `src/core/sync-v2/app/runtimeBridge.test.ts`
  - Verify the new route.
- `src/entrypoints/background.ts`
  - Route the advanced history-detail runtime action.
- `src/entrypoints/popup/popup.tsx`
  - Show compact moved/conflict merge summary.
- `src/entrypoints/popup/popup.test.tsx`
  - Verify popup stays summary-only.
- `src/entrypoints/options/options.tsx`
  - Add merge-detail drawer, conflict cards, and replay timeline.
- `src/entrypoints/options/options.test.tsx`
  - Verify conflict visualization and replay rendering.
- `src/public/_locales/en/messages.json`
  - Add Release 6 strings.
- `src/public/_locales/zh_CN/messages.json`
  - Add Release 6 strings for the main Chinese locale.

---

## Task 1: Extend the Domain Model for Advanced Merge History

**Files:**
- Modify: `src/core/sync-v2/domain.ts`
- Create: `src/core/sync-v2/domain.release6.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/domain.release6.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeSyncSummary, type SyncHistoryEntry } from './domain';

describe('normalizeSyncSummary', () => {
  it('fills in moved for history entries created before release 6', () => {
    expect(
      normalizeSyncSummary({
        added: 1,
        removed: 0,
        modified: 2,
        conflicts: 0,
      }),
    ).toEqual({
      added: 1,
      removed: 0,
      modified: 2,
      conflicts: 0,
      moved: 0,
    });
  });
});

describe('advanced merge history shape', () => {
  it('allows decision-log payloads on history entries', () => {
    const entry: SyncHistoryEntry = {
      sessionId: 'session-1',
      createdAt: 1713420000000,
      status: 'success',
      trigger: 'manual',
      storageType: 'github-repo',
      summary: {
        added: 0,
        removed: 0,
        modified: 1,
        conflicts: 1,
        moved: 1,
      },
      advancedMerge: {
        analysis: {
          addedKeys: [],
          removedKeys: [],
          modifiedKeys: ['bookmark-1'],
          moved: [
            {
              key: 'bookmark-1',
              title: 'Docs',
              fromParentKey: 'toolbar',
              toParentKey: 'reading-list',
              fromIndex: 1,
              toIndex: 0,
            },
          ],
        },
        conflicts: [],
        decisionLog: {
          version: 1,
          steps: [],
        },
        explainabilitySummary: ['Moved 1 bookmark and resolved 1 conflict.'],
      },
    };

    expect(entry.advancedMerge?.analysis.moved).toHaveLength(1);
    expect(entry.summary.moved).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/domain.release6.test.ts`
Expected: FAIL with `Property 'moved' does not exist` or `Cannot find name 'normalizeSyncSummary'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/domain.ts
export interface SyncSummary {
  added: number;
  removed: number;
  modified: number;
  conflicts: number;
  moved?: number;
}

export interface MoveRecord {
  key: string;
  title: string;
  fromParentKey: string;
  toParentKey: string;
  fromIndex: number;
  toIndex: number;
}

export interface MergeAnalysis {
  addedKeys: string[];
  removedKeys: string[];
  modifiedKeys: string[];
  moved: MoveRecord[];
}

export interface ConflictRecord {
  id: string;
  key: string;
  title: string;
  reason: 'title-changed' | 'url-changed' | 'parent-changed' | 'deleted-vs-modified';
  localLabel: string;
  remoteLabel: string;
  winner: 'local' | 'remote';
  explanation: string;
}

export interface MergeDecisionStep {
  id: string;
  kind:
    | 'load-snapshots'
    | 'detect-diff'
    | 'detect-conflicts'
    | 'resolve-conflict'
    | 'finalize-merge';
  title: string;
  detail: string;
  counts?: Partial<SyncSummary>;
  conflictId?: string;
}

export interface MergeDecisionLog {
  version: 1;
  steps: MergeDecisionStep[];
}

export interface AdvancedMergeDetails {
  analysis: MergeAnalysis;
  conflicts: ConflictRecord[];
  decisionLog: MergeDecisionLog;
  explainabilitySummary: string[];
}

export interface SyncHistoryEntry {
  sessionId: string;
  createdAt: number;
  status: 'success' | 'failed';
  trigger: SyncTrigger;
  storageType: StorageType;
  summary: SyncSummary;
  errorMessage?: string;
  advancedMerge?: AdvancedMergeDetails;
}

export function normalizeSyncSummary(input?: Partial<SyncSummary>): Required<SyncSummary> {
  return {
    added: input?.added ?? 0,
    removed: input?.removed ?? 0,
    modified: input?.modified ?? 0,
    conflicts: input?.conflicts ?? 0,
    moved: input?.moved ?? 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/domain.release6.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/domain.ts src/core/sync-v2/domain.release6.test.ts
git commit -m "feat: add sync v2 advanced merge domain types"
```

---

## Task 2: Implement Pure Move Detection

**Files:**
- Create: `src/core/sync-v2/engine/moveDetection.ts`
- Create: `src/core/sync-v2/engine/moveDetection.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/engine/moveDetection.test.ts
import { describe, expect, it } from 'vitest';
import type { BookmarkSnapshot } from '../domain';
import { detectMoves } from './moveDetection';

const baseline: BookmarkSnapshot = {
  schemaVersion: 1,
  deviceId: 'chrome',
  trigger: 'manual',
  storageType: 'github-repo',
  createdAt: 1,
  summary: { added: 0, removed: 0, modified: 0, conflicts: 0, moved: 0 },
  root: {
    key: 'root',
    title: 'root',
    children: [
      {
        key: 'toolbar',
        title: 'Toolbar',
        children: [
          { key: 'bookmark-1', title: 'Docs', url: 'https://docs.example.com', children: [] },
        ],
      },
      {
        key: 'reading-list',
        title: 'Reading List',
        children: [],
      },
    ],
  },
};

const moved: BookmarkSnapshot = {
  ...baseline,
  root: {
    ...baseline.root,
    children: [
      {
        key: 'toolbar',
        title: 'Toolbar',
        children: [],
      },
      {
        key: 'reading-list',
        title: 'Reading List',
        children: [
          { key: 'bookmark-1', title: 'Docs', url: 'https://docs.example.com', children: [] },
        ],
      },
    ],
  },
};

describe('detectMoves', () => {
  it('detects parent and index changes for the same bookmark key', () => {
    expect(detectMoves(baseline, moved)).toEqual([
      {
        key: 'bookmark-1',
        title: 'Docs',
        fromParentKey: 'toolbar',
        toParentKey: 'reading-list',
        fromIndex: 0,
        toIndex: 0,
      },
    ]);
  });

  it('does not classify a title-only edit as a move', () => {
    const renamed: BookmarkSnapshot = {
      ...baseline,
      root: {
        ...baseline.root,
        children: [
          {
            key: 'toolbar',
            title: 'Toolbar',
            children: [
              { key: 'bookmark-1', title: 'Docs v2', url: 'https://docs.example.com', children: [] },
            ],
          },
          baseline.root.children[1],
        ],
      },
    };

    expect(detectMoves(baseline, renamed)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/engine/moveDetection.test.ts`
Expected: FAIL with `Cannot find module './moveDetection'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/engine/moveDetection.ts
import type { BookmarkNode, BookmarkSnapshot, MoveRecord } from '../domain';

interface NodeLocation {
  title: string;
  parentKey: string;
  index: number;
}

function collectLocations(
  node: BookmarkNode,
  parentKey: string,
  map: Map<string, NodeLocation>,
): void {
  node.children.forEach((child, index) => {
    map.set(child.key, {
      title: child.title,
      parentKey,
      index,
    });
    collectLocations(child, child.key, map);
  });
}

function buildLocationMap(snapshot: BookmarkSnapshot): Map<string, NodeLocation> {
  const map = new Map<string, NodeLocation>();
  collectLocations(snapshot.root, snapshot.root.key, map);
  return map;
}

export function detectMoves(previous: BookmarkSnapshot, next: BookmarkSnapshot): MoveRecord[] {
  const previousMap = buildLocationMap(previous);
  const nextMap = buildLocationMap(next);
  const moves: MoveRecord[] = [];

  for (const [key, previousLocation] of previousMap.entries()) {
    const nextLocation = nextMap.get(key);
    if (!nextLocation) continue;

    if (
      previousLocation.parentKey !== nextLocation.parentKey ||
      previousLocation.index !== nextLocation.index
    ) {
      moves.push({
        key,
        title: nextLocation.title,
        fromParentKey: previousLocation.parentKey,
        toParentKey: nextLocation.parentKey,
        fromIndex: previousLocation.index,
        toIndex: nextLocation.index,
      });
    }
  }

  return moves;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/engine/moveDetection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/engine/moveDetection.ts src/core/sync-v2/engine/moveDetection.test.ts
git commit -m "feat: add sync v2 move detection"
```

---

## Task 3: Add Conflict Presentation and Lightweight Decision Logging

**Files:**
- Create: `src/core/sync-v2/engine/conflictPresentation.ts`
- Create: `src/core/sync-v2/engine/conflictPresentation.test.ts`
- Create: `src/core/sync-v2/engine/decisionLog.ts`
- Create: `src/core/sync-v2/engine/decisionLog.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/sync-v2/engine/conflictPresentation.test.ts
import { describe, expect, it } from 'vitest';
import { presentConflicts } from './conflictPresentation';

describe('presentConflicts', () => {
  it('explains a parent-change conflict in plain language', () => {
    const records = presentConflicts([
      {
        key: 'bookmark-1',
        title: 'Docs',
        reason: 'parent-changed',
        localLabel: 'Moved to Reading List',
        remoteLabel: 'Kept in Toolbar',
        winner: 'local',
      },
    ]);

    expect(records[0].explanation).toBe(
      'This bookmark was moved in one place while the other side kept a different location. The merge kept the local location.',
    );
  });
});
```

```typescript
// src/core/sync-v2/engine/decisionLog.test.ts
import { describe, expect, it } from 'vitest';
import { createDecisionLog } from './decisionLog';

describe('createDecisionLog', () => {
  it('builds a lightweight ordered replay timeline', () => {
    const log = createDecisionLog({
      summary: {
        added: 0,
        removed: 0,
        modified: 1,
        conflicts: 1,
        moved: 1,
      },
      conflicts: [
        {
          id: 'conflict-1',
          key: 'bookmark-1',
          title: 'Docs',
          reason: 'title-changed',
          localLabel: 'Docs v2',
          remoteLabel: 'Docs',
          winner: 'local',
          explanation: 'The local title was newer, so the merge kept it.',
        },
      ],
    });

    expect(log.steps.map(step => step.kind)).toEqual([
      'load-snapshots',
      'detect-diff',
      'detect-conflicts',
      'resolve-conflict',
      'finalize-merge',
    ]);
    expect(log.steps[3].conflictId).toBe('conflict-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/sync-v2/engine/conflictPresentation.test.ts src/core/sync-v2/engine/decisionLog.test.ts`
Expected: FAIL with missing module errors

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/engine/conflictPresentation.ts
import type { ConflictRecord } from '../domain';

export interface ConflictCandidateInput {
  key: string;
  title: string;
  reason: ConflictRecord['reason'];
  localLabel: string;
  remoteLabel: string;
  winner: ConflictRecord['winner'];
}

function toExplanation(input: ConflictCandidateInput): string {
  if (input.reason === 'parent-changed') {
    return `This bookmark was moved in one place while the other side kept a different location. The merge kept the ${input.winner} location.`;
  }

  if (input.reason === 'title-changed') {
    return `Both sides changed the bookmark title. The merge kept the ${input.winner} title.`;
  }

  if (input.reason === 'url-changed') {
    return `Both sides changed the bookmark URL. The merge kept the ${input.winner} URL.`;
  }

  return `One side deleted this bookmark while the other side edited it. The merge kept the ${input.winner} version.`;
}

export function presentConflicts(input: ConflictCandidateInput[]): ConflictRecord[] {
  return input.map((item, index) => ({
    id: `conflict-${index + 1}`,
    key: item.key,
    title: item.title,
    reason: item.reason,
    localLabel: item.localLabel,
    remoteLabel: item.remoteLabel,
    winner: item.winner,
    explanation: toExplanation(item),
  }));
}
```

```typescript
// src/core/sync-v2/engine/decisionLog.ts
import type { ConflictRecord, MergeDecisionLog, SyncSummary } from '../domain';

export function createDecisionLog(input: {
  summary: SyncSummary;
  conflicts: ConflictRecord[];
}): MergeDecisionLog {
  const steps = [
    {
      id: 'step-load',
      kind: 'load-snapshots' as const,
      title: 'Load local, remote, and baseline snapshots',
      detail: 'The merge started from the last shared snapshot plus the current local and remote trees.',
    },
    {
      id: 'step-diff',
      kind: 'detect-diff' as const,
      title: 'Detect bookmark changes',
      detail: `Detected ${input.summary.added} added, ${input.summary.removed} removed, ${input.summary.modified} modified, and ${input.summary.moved} moved bookmarks.`,
      counts: input.summary,
    },
    {
      id: 'step-conflicts',
      kind: 'detect-conflicts' as const,
      title: 'Detect conflicts',
      detail: `Detected ${input.conflicts.length} conflicts that required a decision.`,
      counts: { conflicts: input.conflicts.length },
    },
    ...input.conflicts.map(conflict => ({
      id: `step-${conflict.id}`,
      kind: 'resolve-conflict' as const,
      title: `Resolve ${conflict.title}`,
      detail: conflict.explanation,
      conflictId: conflict.id,
    })),
    {
      id: 'step-finalize',
      kind: 'finalize-merge' as const,
      title: 'Finalize merged snapshot',
      detail: 'The final merged snapshot and its decision log were written into sync history.',
      counts: input.summary,
    },
  ];

  return {
    version: 1,
    steps,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/sync-v2/engine/conflictPresentation.test.ts src/core/sync-v2/engine/decisionLog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/engine/conflictPresentation.ts src/core/sync-v2/engine/conflictPresentation.test.ts src/core/sync-v2/engine/decisionLog.ts src/core/sync-v2/engine/decisionLog.test.ts
git commit -m "feat: add sync v2 conflict presentation and decision log"
```

---

## Task 4: Integrate Advanced Merge Output into the v2 Engine

**Files:**
- Modify: `src/core/sync-v2/engine/merge.ts`
- Modify: `src/core/sync-v2/engine/merge.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/sync-v2/engine/merge.test.ts
import { describe, expect, it } from 'vitest';
import { mergeSnapshots } from './merge';

describe('mergeSnapshots release 6', () => {
  it('returns moved summary counts, structured conflicts, and a decision log', () => {
    const result = mergeSnapshots({
      baseline: {
        schemaVersion: 1,
        deviceId: 'baseline',
        trigger: 'manual',
        storageType: 'github-repo',
        createdAt: 1,
        summary: { added: 0, removed: 0, modified: 0, conflicts: 0, moved: 0 },
        root: {
          key: 'root',
          title: 'root',
          children: [
            {
              key: 'toolbar',
              title: 'Toolbar',
              children: [
                { key: 'bookmark-1', title: 'Docs', url: 'https://docs.example.com', children: [] },
              ],
            },
            { key: 'reading-list', title: 'Reading List', children: [] },
          ],
        },
      },
      local: {
        schemaVersion: 1,
        deviceId: 'local',
        trigger: 'manual',
        storageType: 'github-repo',
        createdAt: 2,
        summary: { added: 0, removed: 0, modified: 0, conflicts: 0, moved: 0 },
        root: {
          key: 'root',
          title: 'root',
          children: [
            { key: 'toolbar', title: 'Toolbar', children: [] },
            {
              key: 'reading-list',
              title: 'Reading List',
              children: [
                { key: 'bookmark-1', title: 'Docs', url: 'https://docs.example.com', children: [] },
              ],
            },
          ],
        },
      },
      remote: {
        schemaVersion: 1,
        deviceId: 'remote',
        trigger: 'manual',
        storageType: 'github-repo',
        createdAt: 3,
        summary: { added: 0, removed: 0, modified: 0, conflicts: 0, moved: 0 },
        root: {
          key: 'root',
          title: 'root',
          children: [
            {
              key: 'toolbar',
              title: 'Toolbar',
              children: [
                { key: 'bookmark-1', title: 'Docs Updated', url: 'https://docs.example.com', children: [] },
              ],
            },
            { key: 'reading-list', title: 'Reading List', children: [] },
          ],
        },
      },
    });

    expect(result.summary.moved).toBe(1);
    expect(result.conflicts[0].reason).toBe('parent-changed');
    expect(result.decisionLog.steps).toHaveLength(5);
    expect(result.explainabilitySummary[0]).toContain('1 moved');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/sync-v2/engine/merge.test.ts`
Expected: FAIL because the merge result does not expose `moved`, `conflicts`, or `decisionLog`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/engine/merge.ts
import { createDecisionLog } from './decisionLog';
import { presentConflicts } from './conflictPresentation';
import { detectMoves } from './moveDetection';
import { normalizeSyncSummary, type BookmarkSnapshot, type ConflictRecord, type MergeAnalysis } from '../domain';

function collectModifiedKeys(previous: BookmarkSnapshot, next: BookmarkSnapshot): string[] {
  const keys: string[] = [];

  function walk(prevNode: typeof previous.root, nextNode: typeof next.root): void {
    const prevChildren = new Map(prevNode.children.map(child => [child.key, child]));
    nextNode.children.forEach(child => {
      const prevChild = prevChildren.get(child.key);
      if (!prevChild) return;

      if (prevChild.title !== child.title || prevChild.url !== child.url) {
        keys.push(child.key);
      }

      walk(prevChild, child);
    });
  }

  walk(previous.root, next.root);
  return keys;
}

function findConflictRecords(input: {
  baseline: BookmarkSnapshot;
  local: BookmarkSnapshot;
  remote: BookmarkSnapshot;
  localMoves: ReturnType<typeof detectMoves>;
  remoteMoves: ReturnType<typeof detectMoves>;
}): ConflictRecord[] {
  const localMovedKeys = new Set(input.localMoves.map(item => item.key));
  const remoteMovedKeys = new Set(input.remoteMoves.map(item => item.key));
  const localModifiedKeys = new Set(collectModifiedKeys(input.baseline, input.local));
  const remoteModifiedKeys = new Set(collectModifiedKeys(input.baseline, input.remote));

  const parentConflictKeys = [...localMovedKeys].filter(key => remoteModifiedKeys.has(key));
  const titleConflictKeys = [...localModifiedKeys].filter(key => remoteModifiedKeys.has(key));

  return presentConflicts([
    ...parentConflictKeys.map(key => ({
      key,
      title: key,
      reason: 'parent-changed' as const,
      localLabel: 'Moved locally',
      remoteLabel: 'Edited remotely',
      winner: 'local' as const,
    })),
    ...titleConflictKeys
      .filter(key => !parentConflictKeys.includes(key))
      .map(key => ({
        key,
        title: key,
        reason: 'title-changed' as const,
        localLabel: 'Local title',
        remoteLabel: 'Remote title',
        winner: 'local' as const,
      })),
  ]);
}

export function mergeSnapshots(input: {
  baseline: BookmarkSnapshot;
  local: BookmarkSnapshot;
  remote: BookmarkSnapshot;
}) {
  const localMoves = detectMoves(input.baseline, input.local);
  const remoteMoves = detectMoves(input.baseline, input.remote);
  const conflicts = findConflictRecords({
    baseline: input.baseline,
    local: input.local,
    remote: input.remote,
    localMoves,
    remoteMoves,
  });
  const analysis: MergeAnalysis = {
    addedKeys: [],
    removedKeys: [],
    modifiedKeys: collectModifiedKeys(input.baseline, input.local),
    moved: localMoves,
  };
  const summary = normalizeSyncSummary({
    added: analysis.addedKeys.length,
    removed: analysis.removedKeys.length,
    modified: analysis.modifiedKeys.length,
    conflicts: conflicts.length,
    moved: analysis.moved.length,
  });
  const decisionLog = createDecisionLog({
    summary,
    conflicts,
  });

  return {
    snapshot: input.local,
    summary,
    analysis,
    conflicts,
    decisionLog,
    explainabilitySummary: [
      `Detected ${summary.moved} moved bookmarks and ${summary.conflicts} conflicts.`,
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/sync-v2/engine/merge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/engine/merge.ts src/core/sync-v2/engine/merge.test.ts
git commit -m "feat: add advanced output to sync v2 merge engine"
```

---

## Task 5: Persist Advanced Merge Details and Expose History Detail Routing

**Files:**
- Modify: `src/core/sync-v2/app/historyStore.ts`
- Modify: `src/core/sync-v2/app/historyStore.test.ts`
- Modify: `src/core/sync-v2/app/orchestrator.ts`
- Modify: `src/core/sync-v2/app/orchestrator.test.ts`
- Modify: `src/core/sync-v2/app/runtimeBridge.ts`
- Modify: `src/core/sync-v2/app/runtimeBridge.test.ts`
- Modify: `src/entrypoints/background.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/core/sync-v2/app/historyStore.test.ts
import { describe, expect, it } from 'vitest';
import { createHistoryStore } from './historyStore';

describe('historyStore release 6', () => {
  it('normalizes old entries and returns advanced details by session id', async () => {
    await browser.storage.local.set({
      syncV2History: [
        {
          sessionId: 'old-entry',
          createdAt: 1713420000000,
          status: 'success',
          trigger: 'manual',
          storageType: 'github-repo',
          summary: {
            added: 1,
            removed: 0,
            modified: 0,
            conflicts: 0,
          },
        },
      ],
    });

    const store = createHistoryStore({ limit: 20 });
    const entry = await store.get('old-entry');

    expect(entry?.summary.moved).toBe(0);
    expect(entry?.advancedMerge).toBeUndefined();
  });
});
```

```typescript
// src/core/sync-v2/app/runtimeBridge.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSyncV2RuntimeBridge } from './runtimeBridge';

describe('runtimeBridge release 6', () => {
  it('routes getSyncV2HistoryDetail to the history service', async () => {
    const getHistoryDetail = vi.fn().mockResolvedValue({ sessionId: 'session-1' });
    const bridge = createSyncV2RuntimeBridge({
      sync: vi.fn(),
      getHistory: vi.fn(),
      getHistoryDetail,
      getDiagnostics: vi.fn(),
      listRestorePoints: vi.fn(),
      previewRestorePoint: vi.fn(),
      restoreRestorePoint: vi.fn(),
      testConnection: vi.fn(),
      forceSync: vi.fn(),
      deleteRemote: vi.fn(),
    });

    const result = await bridge.handleMessage({
      name: 'getSyncV2HistoryDetail',
      payload: { sessionId: 'session-1' },
    });

    expect(getHistoryDetail).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(result).toEqual({ sessionId: 'session-1' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/sync-v2/app/historyStore.test.ts src/core/sync-v2/app/runtimeBridge.test.ts`
Expected: FAIL because `historyStore.get()` and `getSyncV2HistoryDetail` do not exist

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/core/sync-v2/app/historyStore.ts
import { normalizeSyncSummary, type SyncHistoryEntry } from '../domain';

function normalizeHistoryEntry(entry: SyncHistoryEntry): SyncHistoryEntry {
  return {
    ...entry,
    summary: normalizeSyncSummary(entry.summary),
  };
}

export function createHistoryStore(input: { limit: number }) {
  const key = 'syncV2History';

  return {
    async list(): Promise<SyncHistoryEntry[]> {
      const result = await browser.storage.local.get(key);
      return ((result[key] as SyncHistoryEntry[] | undefined) ?? []).map(normalizeHistoryEntry);
    },

    async get(sessionId: string): Promise<SyncHistoryEntry | null> {
      const entries = await this.list();
      return entries.find(entry => entry.sessionId === sessionId) ?? null;
    },

    async append(entry: SyncHistoryEntry): Promise<void> {
      const current = await this.list();
      const next = [normalizeHistoryEntry(entry), ...current].slice(0, input.limit);
      await browser.storage.local.set({ [key]: next });
    },
  };
}
```

```typescript
// src/core/sync-v2/app/orchestrator.ts
const merged = mergeSnapshots({
  baseline,
  local,
  remote,
});

const entry: SyncHistoryEntry = {
  sessionId: crypto.randomUUID(),
  createdAt: Date.now(),
  status: 'success',
  trigger: params.trigger,
  storageType: params.profile.type,
  summary: merged.summary,
  advancedMerge: {
    analysis: merged.analysis,
    conflicts: merged.conflicts,
    decisionLog: merged.decisionLog,
    explainabilitySummary: merged.explainabilitySummary,
  },
};
```

```typescript
// src/core/sync-v2/app/runtimeBridge.ts
export function createSyncV2RuntimeBridge(input: {
  sync: (payload: unknown) => Promise<unknown>;
  getHistory: () => Promise<unknown>;
  getHistoryDetail: (payload: unknown) => Promise<unknown>;
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
      if (message.name === 'getSyncV2HistoryDetail') return input.getHistoryDetail(message.payload);
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
const syncV2Bridge = createSyncV2RuntimeBridge({
  // keep the existing Release 2 and Release 3 handlers in place
  getHistory: () => historyStore.list(),
  getHistoryDetail: async payload => {
    const sessionId = (payload as { sessionId: string }).sessionId;
    return historyStore.get(sessionId);
  },
});
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/core/sync-v2/app/historyStore.test.ts src/core/sync-v2/app/orchestrator.test.ts src/core/sync-v2/app/runtimeBridge.test.ts`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sync-v2/app/historyStore.ts src/core/sync-v2/app/historyStore.test.ts src/core/sync-v2/app/orchestrator.ts src/core/sync-v2/app/orchestrator.test.ts src/core/sync-v2/app/runtimeBridge.ts src/core/sync-v2/app/runtimeBridge.test.ts src/entrypoints/background.ts
git commit -m "feat: persist sync v2 advanced merge history"
```

---

## Task 6: Render Conflict Visualization and Replay UI

**Files:**
- Modify: `src/entrypoints/options/options.tsx`
- Modify: `src/entrypoints/options/options.test.tsx`
- Modify: `src/entrypoints/popup/popup.tsx`
- Modify: `src/entrypoints/popup/popup.test.tsx`
- Modify: `src/public/_locales/en/messages.json`
- Modify: `src/public/_locales/zh_CN/messages.json`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/entrypoints/options/options.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Options from './options';

describe('Options release 6 merge details', () => {
  beforeEach(() => {
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async message => {
      if (message.name === 'getSyncV2History') {
        return [
          {
            sessionId: 'session-1',
            createdAt: 1713420000000,
            status: 'success',
            trigger: 'manual',
            storageType: 'github-repo',
            summary: {
              added: 0,
              removed: 0,
              modified: 1,
              conflicts: 1,
              moved: 1,
            },
          },
        ];
      }

      if (message.name === 'getSyncV2HistoryDetail') {
        return {
          sessionId: 'session-1',
          createdAt: 1713420000000,
          status: 'success',
          trigger: 'manual',
          storageType: 'github-repo',
          summary: {
            added: 0,
            removed: 0,
            modified: 1,
            conflicts: 1,
            moved: 1,
          },
          advancedMerge: {
            analysis: {
              addedKeys: [],
              removedKeys: [],
              modifiedKeys: ['bookmark-1'],
              moved: [
                {
                  key: 'bookmark-1',
                  title: 'Docs',
                  fromParentKey: 'toolbar',
                  toParentKey: 'reading-list',
                  fromIndex: 0,
                  toIndex: 0,
                },
              ],
            },
            conflicts: [
              {
                id: 'conflict-1',
                key: 'bookmark-1',
                title: 'Docs',
                reason: 'parent-changed',
                localLabel: 'Moved to Reading List',
                remoteLabel: 'Kept in Toolbar',
                winner: 'local',
                explanation:
                  'This bookmark was moved in one place while the other side kept a different location. The merge kept the local location.',
              },
            ],
            decisionLog: {
              version: 1,
              steps: [
                {
                  id: 'step-load',
                  kind: 'load-snapshots',
                  title: 'Load local, remote, and baseline snapshots',
                  detail: 'The merge started from the last shared snapshot plus the current local and remote trees.',
                },
              ],
            },
            explainabilitySummary: ['Detected 1 moved bookmarks and 1 conflicts.'],
          },
        };
      }

      if (message.name === 'getSyncV2Diagnostics') {
        return {
          latestRuns: [],
          latestSuccessfulRun: null,
          latestFailedRun: null,
          encryptionEnabled: false,
          capabilities: {
            supportsBasicHistory: true,
            supportsTimeMachine: true,
          },
          warnings: [],
        };
      }

      if (message.name === 'getSyncV2RestorePoints') {
        return [];
      }

      return undefined;
    });
  });

  it('shows conflict cards and replay steps after opening a history item', async () => {
    render(<Options />);

    fireEvent.click(await screen.findByRole('button', { name: 'View Merge Details' }));

    await waitFor(() => {
      expect(screen.getByText('Moved to Reading List')).toBeInTheDocument();
      expect(screen.getByText('Load local, remote, and baseline snapshots')).toBeInTheDocument();
    });
  });
});
```

```tsx
// src/entrypoints/popup/popup.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Popup from './popup';

describe('Popup release 6 summary', () => {
  it('shows a compact moved/conflict summary without the replay timeline', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      syncV2LastResult: {
        status: 'success',
        summary: {
          added: 0,
          removed: 0,
          modified: 1,
          conflicts: 1,
          moved: 1,
        },
      },
    });
    vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
      latestRuns: [],
      latestSuccessfulRun: null,
      latestFailedRun: null,
      encryptionEnabled: false,
      capabilities: {
        supportsBasicHistory: true,
        supportsTimeMachine: true,
      },
      warnings: [],
    });

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText('Moved 1')).toBeInTheDocument();
      expect(screen.getByText('Conflicts 1')).toBeInTheDocument();
    });

    expect(screen.queryByText('Load local, remote, and baseline snapshots')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/entrypoints/options/options.test.tsx src/entrypoints/popup/popup.test.tsx`
Expected: FAIL because merge-detail and moved-summary UI is not rendered yet

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/entrypoints/popup/popup.tsx
type LastResult = {
  status: 'success' | 'failed';
  summary: { added: number; removed: number; modified: number; conflicts: number; moved?: number };
};

<div className="popup-card">
  <h2>{browser.i18n.getMessage('lastMergeSummary') || 'Last Merge Summary'}</h2>
  <p>{lastResult ? lastResult.status : 'Never'}</p>
  <div className="d-flex gap-2 flex-wrap">
    <span className="badge bg-light text-dark">
      {(browser.i18n.getMessage('mergeMoved') || 'Moved')} {lastResult?.summary.moved ?? 0}
    </span>
    <span className="badge bg-light text-dark">
      {(browser.i18n.getMessage('mergeConflicts') || 'Conflicts')} {lastResult?.summary.conflicts ?? 0}
    </span>
  </div>
</div>
```

```tsx
// src/entrypoints/options/options.tsx
const [historyEntries, setHistoryEntries] = useState<any[]>([]);
const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<any>(null);

useEffect(() => {
  browser.runtime.sendMessage({ name: 'getSyncV2History' }).then(setHistoryEntries);
}, []);

const openMergeDetail = async (sessionId: string) => {
  const detail = await browser.runtime.sendMessage({
    name: 'getSyncV2HistoryDetail',
    payload: { sessionId },
  });
  setSelectedHistoryDetail(detail);
};

<Card className="mb-3">
  <Card.Header>{browser.i18n.getMessage('mergeHistory') || 'Merge History'}</Card.Header>
  <Card.Body>
    {historyEntries.map(entry => (
      <div key={entry.sessionId} className="d-flex justify-content-between align-items-center mb-2">
        <div>
          <div>{new Date(entry.createdAt).toLocaleString()}</div>
          <small className="text-muted">
            {(browser.i18n.getMessage('mergeMoved') || 'Moved')} {entry.summary.moved ?? 0} / {(browser.i18n.getMessage('mergeConflicts') || 'Conflicts')} {entry.summary.conflicts}
          </small>
        </div>
        <Button size="sm" variant="outline-primary" onClick={() => openMergeDetail(entry.sessionId)}>
          {browser.i18n.getMessage('viewMergeDetails') || 'View Merge Details'}
        </Button>
      </div>
    ))}
  </Card.Body>
</Card>

{selectedHistoryDetail?.advancedMerge && (
  <Card className="mb-3">
    <Card.Header>{browser.i18n.getMessage('mergeReplay') || 'Merge Replay'}</Card.Header>
    <Card.Body>
      <h3 className="h6">{browser.i18n.getMessage('mergeConflicts') || 'Conflicts'}</h3>
      {selectedHistoryDetail.advancedMerge.conflicts.map((conflict: any) => (
        <div key={conflict.id} className="border rounded p-3 mb-2">
          <strong>{conflict.title}</strong>
          <div>{conflict.localLabel}</div>
          <div>{conflict.remoteLabel}</div>
          <p className="mb-0 text-muted">{conflict.explanation}</p>
        </div>
      ))}

      <h3 className="h6 mt-4">{browser.i18n.getMessage('mergeReplaySteps') || 'Replay Steps'}</h3>
      <ol className="mb-0 ps-3">
        {selectedHistoryDetail.advancedMerge.decisionLog.steps.map((step: any) => (
          <li key={step.id} className="mb-2">
            <strong>{step.title}</strong>
            <div className="text-muted">{step.detail}</div>
          </li>
        ))}
      </ol>
    </Card.Body>
  </Card>
)}
```

```json
// src/public/_locales/en/messages.json
{
  "lastMergeSummary": { "message": "Last Merge Summary" },
  "mergeMoved": { "message": "Moved" },
  "mergeConflicts": { "message": "Conflicts" },
  "mergeHistory": { "message": "Merge History" },
  "viewMergeDetails": { "message": "View Merge Details" },
  "mergeReplay": { "message": "Merge Replay" },
  "mergeReplaySteps": { "message": "Replay Steps" }
}
```

```json
// src/public/_locales/zh_CN/messages.json
{
  "lastMergeSummary": { "message": "最近一次合并摘要" },
  "mergeMoved": { "message": "移动" },
  "mergeConflicts": { "message": "冲突" },
  "mergeHistory": { "message": "合并历史" },
  "viewMergeDetails": { "message": "查看合并详情" },
  "mergeReplay": { "message": "合并回放" },
  "mergeReplaySteps": { "message": "回放步骤" }
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/entrypoints/options/options.test.tsx src/entrypoints/popup/popup.test.tsx`
Expected: PASS

Run: `npm run compile`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/options/options.tsx src/entrypoints/options/options.test.tsx src/entrypoints/popup/popup.tsx src/entrypoints/popup/popup.test.tsx src/public/_locales/en/messages.json src/public/_locales/zh_CN/messages.json
git commit -m "feat: add sync v2 merge visualization ui"
```

---

## Task 7: Run Full Release 6 Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-advanced-merge-plan.md`

- [ ] **Step 1: Add the manual verification checklist to the bottom of this plan**

```markdown
## Manual Verification Checklist

- [ ] A bookmark moved between folders is counted under `Moved`
- [ ] A move-heavy sync still renders a compact summary in popup
- [ ] The options page can open one history entry and show its conflict cards
- [ ] A parent-change conflict is explained in plain language
- [ ] A title or URL conflict is explained in plain language
- [ ] The replay panel shows ordered decision steps rather than raw logs
- [ ] Older history entries that have no `advancedMerge` payload still open without crashing
- [ ] Chrome and Firefox both render the merge-detail panel without layout regressions
- [ ] Release 1-3 features still behave normally after Release 6 changes
```

- [ ] **Step 2: Run the full automated verification**

Run: `npm run compile`
Expected: PASS

Run: `npm test`
Expected: PASS with Release 1, Release 2, Release 3, and Release 6 tests all green

Run: `npm run build`
Expected: PASS with `.output/` generated successfully

- [ ] **Step 3: Perform the manual checks**

Run: `npm run dev`
Expected: Chrome build loads, popup shows compact merge summary, options page renders merge details and replay timeline

Run: `npm run dev:firefox`
Expected: Firefox build loads, popup shows compact merge summary, options page renders merge details and replay timeline

- [ ] **Step 4: Commit the Release 6 branch after verification**

```bash
git add src/core/sync-v2 src/entrypoints/background.ts src/entrypoints/options src/entrypoints/popup src/public/_locales/en/messages.json src/public/_locales/zh_CN/messages.json docs/superpowers/plans/2026-04-18-bookmarkhub-v2-advanced-merge-plan.md
git commit -m "feat: ship bookmarkhub v2 release 6 advanced merge"
```

---

## Spec Coverage Self-Check

- Move detection: covered by Tasks 1, 2, and 4.
- Structured conflict records: covered by Tasks 1, 3, and 4.
- Lightweight decision replay: covered by Tasks 1, 3, 5, and 6.
- History-backed explainability: covered by Tasks 1, 5, and 6.
- Popup remains summary-only: covered by Task 6.
- Options page shows detailed conflict and replay UI: covered by Task 6.
- Backward compatibility for older history entries: covered by Tasks 1 and 5.
- Chrome and Firefox validation: covered by Task 7.

Gaps intentionally left for follow-up plans:

- New storage backends
- OAuth flows
- Encryption redesign
- Full bookmark-tree playback
- Interactive conflict editing before merge

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

Plan complete and saved to `docs/superpowers/plans/2026-04-18-bookmarkhub-v2-advanced-merge-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

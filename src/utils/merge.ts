import { BookmarkInfo, SyncDataInfo, ConflictInfo } from './models';
import { BookmarkChange, detectChanges, ChangeDetectionResult } from './changeDetection';

export type ConflictMode = 'auto' | 'prompt';

export interface MergeResult {
  merged: BookmarkInfo[];
  hasChanges: boolean;
  conflicts: ConflictInfo[];
  appliedChanges: BookmarkChange[];
  changeSummary: string;
}

interface ConflictCandidate {
  local: BookmarkChange;
  remote: BookmarkChange;
}

interface ResolvedConflict {
  local: BookmarkChange;
  remote: BookmarkChange;
  winner: 'local' | 'remote' | null;
  isConflict: boolean;
}

export function mergeBookmarks(
  local: BookmarkInfo[],
  remote: SyncDataInfo | null,
  conflictMode: ConflictMode
): MergeResult {
  if (!remote?.bookmarks) {
    return {
      merged: local,
      hasChanges: false,
      conflicts: [],
      appliedChanges: [],
      changeSummary: '无变更',
    };
  }
  
  const localChanges = detectChanges(remote.bookmarks, local);
  const remoteChanges = detectChanges(local, remote.bookmarks);
  
  if (!localChanges.hasChanges && !remoteChanges.hasChanges) {
    return {
      merged: local,
      hasChanges: false,
      conflicts: [],
      appliedChanges: [],
      changeSummary: '无变更',
    };
  }
  
  const conflicts = findConflicts(localChanges, remoteChanges);
  const resolved = resolveConflicts(conflicts, conflictMode);
  
  const merged = applyChanges(remote.bookmarks, localChanges, resolved);
  
  const appliedChanges = localChanges.changes.filter(change => {
    const resolution = resolved.find(r => 
      r.local.bookmark.id === change.bookmark.id
    );
    return !resolution || resolution.winner === 'local' || !resolution.isConflict;
  });
  
  const conflictInfos: ConflictInfo[] = resolved
    .filter(r => r.isConflict)
    .map(r => ({
      type: 'modified' as const,
      localBookmark: r.local.bookmark,
      remoteBookmark: r.remote.bookmark,
    }));
  
  return {
    merged,
    hasChanges: appliedChanges.length > 0,
    conflicts: conflictInfos,
    appliedChanges,
    changeSummary: formatChangeSummary(localChanges, remoteChanges),
  };
}

function findConflicts(
  local: ChangeDetectionResult,
  remote: ChangeDetectionResult
): ConflictCandidate[] {
  const conflicts: ConflictCandidate[] = [];
  
  for (const l of local.changes) {
    for (const r of remote.changes) {
      if (l.bookmark.id === r.bookmark.id) {
        conflicts.push({ local: l, remote: r });
      }
    }
  }
  
  return conflicts;
}

function resolveConflicts(
  conflicts: ConflictCandidate[],
  mode: ConflictMode
): ResolvedConflict[] {
  return conflicts.map(c => {
    if (mode === 'auto') {
      const useLocal = c.local.timestamp > c.remote.timestamp;
      return {
        ...c,
        winner: useLocal ? 'local' : 'remote',
        isConflict: false,
      };
    }
    
    return {
      ...c,
      winner: null,
      isConflict: true,
    };
  });
}

function applyChanges(
  base: BookmarkInfo[],
  localChanges: ChangeDetectionResult,
  resolved: ResolvedConflict[]
): BookmarkInfo[] {
  const result: BookmarkInfo[] = JSON.parse(JSON.stringify(base));
  
  for (const change of localChanges.created) {
    const shouldApply = !resolved.find(r => 
      r.local.bookmark.id === change.bookmark.id && r.winner === 'remote'
    );
    if (shouldApply) {
      addBookmarkToTree(result, change.bookmark);
    }
  }
  
  for (const change of localChanges.modified) {
    const resolution = resolved.find(r => r.local.bookmark.id === change.bookmark.id);
    if (!resolution || resolution.winner !== 'remote') {
      updateBookmarkInTree(result, change.bookmark);
    }
  }
  
  for (const change of localChanges.deleted) {
    const shouldDelete = !resolved.find(r => 
      r.local.bookmark.id === change.bookmark.id && r.winner === 'remote'
    );
    if (shouldDelete) {
      removeBookmarkFromTree(result, change.bookmark.id!);
    }
  }
  
  return result;
}

function addBookmarkToTree(tree: BookmarkInfo[], bookmark: BookmarkInfo): void {
  if (!bookmark.parentId) {
    tree.push(bookmark);
    return;
  }
  
  const parent = findBookmarkById(tree, bookmark.parentId);
  if (parent) {
    if (!parent.children) parent.children = [];
    parent.children.push(bookmark);
  }
}

function updateBookmarkInTree(tree: BookmarkInfo[], bookmark: BookmarkInfo): void {
  const existing = findBookmarkById(tree, bookmark.id!);
  if (existing) {
    Object.assign(existing, bookmark);
  }
}

function removeBookmarkFromTree(tree: BookmarkInfo[], id: string): void {
  for (let i = 0; i < tree.length; i++) {
    if (tree[i].id === id) {
      tree.splice(i, 1);
      return;
    }
    if (tree[i].children) {
      removeBookmarkFromTree(tree[i].children!, id);
    }
  }
}

function findBookmarkById(tree: BookmarkInfo[], id: string): BookmarkInfo | undefined {
  for (const b of tree) {
    if (b.id === id) return b;
    if (b.children) {
      const found = findBookmarkById(b.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function formatChangeSummary(local: ChangeDetectionResult, remote: ChangeDetectionResult): string {
  const parts: string[] = [];
  
  if (local.created.length > 0) parts.push(`本地新增 ${local.created.length} 个`);
  if (local.modified.length > 0) parts.push(`本地修改 ${local.modified.length} 个`);
  if (local.deleted.length > 0) parts.push(`本地删除 ${local.deleted.length} 个`);
  if (local.moved.length > 0) parts.push(`本地移动 ${local.moved.length} 个`);
  
  if (remote.created.length > 0) parts.push(`远程新增 ${remote.created.length} 个`);
  if (remote.modified.length > 0) parts.push(`远程修改 ${remote.modified.length} 个`);
  if (remote.deleted.length > 0) parts.push(`远程删除 ${remote.deleted.length} 个`);
  if (remote.moved.length > 0) parts.push(`远程移动 ${remote.moved.length} 个`);
  
  return parts.length > 0 ? parts.join('，') : '无变更';
}
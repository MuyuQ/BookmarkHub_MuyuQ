import { BookmarkInfo, SyncDataInfo, ConflictInfo, Tombstone } from './models';
import { BookmarkChange, detectChanges, ChangeDetectionResult } from './changeDetection';
import { logger } from './logger';
import { getBookmarkCount } from './bookmarkUtils';

export type ConflictMode = 'auto' | 'prompt';

const MAX_RECURSION_DEPTH = 100;

export interface MergeResult {
  merged: BookmarkInfo[];
  hasChanges: boolean;
  conflicts: ConflictInfo[];
  appliedChanges: BookmarkChange[];
  changeSummary: string;
}

/**
 * 三向合并参数
 */
export interface ThreeWayMergeParams {
  /** 上次同步状态（基准点） */
  baseline: BookmarkInfo[] | null;
  /** 本地当前状态 */
  local: BookmarkInfo[];
  /** 远程当前状态 */
  remote: BookmarkInfo[];
  /** 本地墓碑 */
  localTombstones: Tombstone[];
  /** 远程墓碑 */
  remoteTombstones: Tombstone[];
  /** 冲突解决模式 */
  conflictMode: ConflictMode;
}

/**
 * 三向合并结果
 */
export interface ThreeWayMergeResult {
  /** 合并后的书签数据 */
  merged: BookmarkInfo[];
  /** 合并后的墓碑 */
  tombstones: Tombstone[];
  /** 是否有变更 */
  hasChanges: boolean;
  /** 冲突列表 */
  conflicts: ConflictInfo[];
  /** 变更摘要 */
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

/**
 * @deprecated Use threeWayMerge instead. This function will be removed in a future version.
 */
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
        if (l.type === 'created' && r.type === 'created') continue;
        if (l.type === 'deleted' && r.type === 'deleted') continue;
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
      // 使用书签的实际修改时间进行比较，而非变更检测时的 timestamp
      const localTime = c.local.bookmark.dateGroupModified ?? c.local.bookmark.dateAdded ?? 0;
      const remoteTime = c.remote.bookmark.dateGroupModified ?? c.remote.bookmark.dateAdded ?? 0;
      const useLocal = localTime >= remoteTime;
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
  
  const lostToRemote = (bookmarkId: string): boolean => {
    const resolution = resolved.find(r => r.local.bookmark.id === bookmarkId);
    return resolution !== undefined && resolution.winner === 'remote';
  };
  
  for (const change of localChanges.created) {
    if (!lostToRemote(change.bookmark.id!)) {
      addBookmarkToTree(result, change.bookmark);
    }
  }
  
  for (const change of localChanges.modified) {
    if (!lostToRemote(change.bookmark.id!)) {
      updateBookmarkInTree(result, change.bookmark);
    }
  }
  
  for (const change of localChanges.deleted) {
    if (!lostToRemote(change.bookmark.id!) && change.bookmark.id) {
      removeBookmarkFromTree(result, change.bookmark.id);
    }
  }
  
  for (const change of localChanges.moved) {
    if (!lostToRemote(change.bookmark.id!)) {
      updateBookmarkInTree(result, change.bookmark);
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
    } else {
        tree.push(bookmark);
    }
}

function updateBookmarkInTree(tree: BookmarkInfo[], bookmark: BookmarkInfo): void {
  if (!bookmark.id) return;
  const existing = findBookmarkById(tree, bookmark.id);
  if (existing) {
    Object.assign(existing, bookmark);
  }
}

function removeBookmarkFromTree(tree: BookmarkInfo[], id: string, depth: number = 0): void {
  if (depth > MAX_RECURSION_DEPTH) {
    logger.warn('Max recursion depth exceeded in removeBookmarkFromTree');
    return;
  }
  
  for (let i = 0; i < tree.length; i++) {
    if (tree[i].id === id) {
      tree.splice(i, 1);
      return;
    }
    const children = tree[i].children;
    if (children) {
      removeBookmarkFromTree(children, id, depth + 1);
    }
  }
}

function findBookmarkById(tree: BookmarkInfo[], id: string, depth: number = 0): BookmarkInfo | undefined {
  if (depth > MAX_RECURSION_DEPTH) {
    logger.warn('Max recursion depth exceeded in findBookmarkById');
    return undefined;
  }
  
  for (const b of tree) {
    if (b.id === id) return b;
    if (b.children) {
      const found = findBookmarkById(b.children, id, depth + 1);
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

// ============== 三向合并核心逻辑 ==============

/**
 * 执行三向合并
 *
 * 核心原理：
 * - baseline 是上次同步后的共同状态
 * - 检测 local 相对 baseline 的变化 → 本地真正做了什么
 * - 检测 remote 相对 baseline 的变化 → 远程真正做了什么
 * - 合并两边的变化，处理冲突
 *
 * @param params 三向合并参数
 * @returns 三向合并结果
 */
export function threeWayMerge(params: ThreeWayMergeParams): ThreeWayMergeResult {
  const { baseline, local, remote, localTombstones, remoteTombstones, conflictMode } = params;

  // 1. 如果没有基准点（首次同步），使用本地数据
  if (!baseline || baseline.length === 0) {
    // 合并本地和远程墓碑
    const allTombstones = mergeTombstones(localTombstones, remoteTombstones);
    const cleanedTombstones = cleanExpiredTombstones(allTombstones);

    // 如果远程有数据，应使用远程数据（避免覆盖）
    if (remote && remote.length > 0) {
      logger.info('三向合并: 无基准点但远程有数据，使用远程数据');
      return {
        merged: remote,
        tombstones: cleanedTombstones,
        hasChanges: true,
        conflicts: [],
        changeSummary: '首次同步，使用远程数据'
      };
    }

    logger.info('三向合并: 无基准点，使用本地数据');
    return {
      merged: local,
      tombstones: cleanedTombstones,
      hasChanges: true,
      conflicts: [],
      changeSummary: '首次同步，使用本地数据'
    };
  }

  logger.debug('三向合并: 开始检测变更', {
    baselineCount: getBookmarkCount(baseline),
    localCount: getBookmarkCount(local),
    remoteCount: getBookmarkCount(remote),
    localTombstones: localTombstones.length,
    remoteTombstones: remoteTombstones.length
  });

  // 2. 检测变更（相对基准点）
  const localChanges = detectChanges(baseline, local);
  const remoteChanges = detectChanges(baseline, remote);

  logger.debug('三向合并: 变更检测完成', {
    localChanges: {
      created: localChanges.created.length,
      modified: localChanges.modified.length,
      deleted: localChanges.deleted.length,
      moved: localChanges.moved.length
    },
    remoteChanges: {
      created: remoteChanges.created.length,
      modified: remoteChanges.modified.length,
      deleted: remoteChanges.deleted.length,
      moved: remoteChanges.moved.length
    }
  });

  // 3. 处理墓碑 - 过滤掉已被删除的书签
  const allTombstones = mergeTombstones(localTombstones, remoteTombstones);
  const tombstoneIds = new Set(allTombstones.map(t => t.id));

  logger.debug('三向合并: 合并墓碑', { tombstoneCount: allTombstones.length });

  // 从变更中移除已在墓碑中的书签（防止复活）
  filterChangesByTombstones(localChanges, tombstoneIds);
  filterChangesByTombstones(remoteChanges, tombstoneIds);

  // 4. 检测冲突
  const conflicts = findConflicts(localChanges, remoteChanges);
  const resolved = resolveConflicts(conflicts, conflictMode);

  logger.debug('三向合并: 冲突检测完成', {
    conflictCount: conflicts.length,
    resolvedCount: resolved.filter(r => r.isConflict).length
  });

  // 5. 应用变更
  // 从基准点开始，应用两边的变更
  const merged = applyChangesToBaseline(baseline, localChanges, remoteChanges, resolved);

  // 6. 清理过期墓碑（保留 30 天）
  const cleanedTombstones = cleanExpiredTombstones(allTombstones);

  // 为本次删除的书签创建新墓碑
  const newTombstones = createTombstonesForDeletions(localChanges, remoteChanges, resolved);
  const finalTombstones = [...cleanedTombstones, ...newTombstones];

  // 去重墓碑
  const uniqueTombstones = deduplicateTombstones(finalTombstones);

  const result: ThreeWayMergeResult = {
    merged,
    tombstones: uniqueTombstones,
    hasChanges: localChanges.hasChanges || remoteChanges.hasChanges,
    conflicts: resolved
      .filter(r => r.isConflict)
      .map(r => ({
        type: 'modified' as const,
        localBookmark: r.local.bookmark,
        remoteBookmark: r.remote.bookmark
      })),
    changeSummary: formatChangeSummary(localChanges, remoteChanges)
  };

  logger.info('三向合并: 完成', {
    hasChanges: result.hasChanges,
    conflictCount: result.conflicts.length,
    tombstoneCount: result.tombstones.length
  });

  return result;
}

/**
 * 合并本地和远程墓碑
 * 策略：保留所有墓碑，相同 ID 保留最新的
 *
 * @param local 本地墓碑列表
 * @param remote 远程墓碑列表
 * @returns 合并后的墓碑列表
 */
export function mergeTombstones(local: Tombstone[], remote: Tombstone[]): Tombstone[] {
  const tombstoneMap = new Map<string, Tombstone>();

  // 添加所有墓碑，相同 ID 保留最新的
  [...local, ...remote].forEach(t => {
    const existing = tombstoneMap.get(t.id);
    if (!existing || t.deletedAt > existing.deletedAt) {
      tombstoneMap.set(t.id, t);
    }
  });

  const result = Array.from(tombstoneMap.values());
  logger.debug('合并墓碑', { local: local.length, remote: remote.length, merged: result.length });
  return result;
}

/**
 * 过滤变更中已在墓碑的书签
 * 从创建列表中移除已删除的书签，防止"复活"
 *
 * @param changes 变更检测结果（会被直接修改）
 * @param tombstoneIds 墓碑 ID 集合
 */
export function filterChangesByTombstones(
  changes: ChangeDetectionResult,
  tombstoneIds: Set<string>
): void {
  const beforeCount = changes.created.length;

  // 从创建列表中移除已删除的书签（防止复活）
  changes.created = changes.created.filter(c => {
    const id = c.bookmark.id;
    if (id && tombstoneIds.has(id)) {
      logger.debug('过滤: 跳过已删除书签的创建', { id, title: c.bookmark.title });
      return false;
    }
    return true;
  });

  // 重新计算 changes 数组和 hasChanges
  changes.changes = [...changes.created, ...changes.modified, ...changes.deleted, ...changes.moved];
  changes.hasChanges = changes.changes.length > 0;

  if (beforeCount !== changes.created.length) {
    logger.debug('过滤墓碑变更', { filtered: beforeCount - changes.created.length });
  }
}

/**
 * 应用变更到基准点
 * 先应用远程变更，再应用本地变更，冲突时根据 resolved 决定胜负
 *
 * @param baseline 基准书签数据
 * @param localChanges 本地变更
 * @param remoteChanges 远程变更
 * @param resolved 已解决的冲突
 * @returns 合并后的书签数据
 */
export function applyChangesToBaseline(
  baseline: BookmarkInfo[],
  localChanges: ChangeDetectionResult,
  remoteChanges: ChangeDetectionResult,
  resolved: ResolvedConflict[]
): BookmarkInfo[] {
  const result: BookmarkInfo[] = JSON.parse(JSON.stringify(baseline));

  // 辅助函数：判断远程是否输给本地
  const lostToLocal = (id: string): boolean => {
    const r = resolved.find(res => res.remote.bookmark.id === id);
    return r !== undefined && r.winner === 'local';
  };

  // 辅助函数：判断本地是否输给远程
  const lostToRemote = (id: string): boolean => {
    const r = resolved.find(res => res.local.bookmark.id === id);
    return r !== undefined && r.winner === 'remote';
  };

  // 先应用远程变更（除非本地赢了）
  for (const change of remoteChanges.created) {
    if (!lostToLocal(change.bookmark.id || '')) {
      addBookmarkToTree(result, change.bookmark);
    }
  }
  for (const change of remoteChanges.modified) {
    if (!lostToLocal(change.bookmark.id || '')) {
      updateBookmarkInTree(result, change.bookmark);
    }
  }
  for (const change of remoteChanges.deleted) {
    if (!lostToLocal(change.bookmark.id || '')) {
      removeBookmarkFromTree(result, change.bookmark.id || '');
    }
  }
  for (const change of remoteChanges.moved) {
    if (!lostToLocal(change.bookmark.id || '')) {
      updateBookmarkInTree(result, change.bookmark);
    }
  }

  // 再应用本地变更（除非远程赢了）
  for (const change of localChanges.created) {
    if (!lostToRemote(change.bookmark.id || '')) {
      addBookmarkToTree(result, change.bookmark);
    }
  }
  for (const change of localChanges.modified) {
    if (!lostToRemote(change.bookmark.id || '')) {
      updateBookmarkInTree(result, change.bookmark);
    }
  }
  for (const change of localChanges.deleted) {
    if (!lostToRemote(change.bookmark.id || '')) {
      removeBookmarkFromTree(result, change.bookmark.id || '');
    }
  }
  for (const change of localChanges.moved) {
    if (!lostToRemote(change.bookmark.id || '')) {
      updateBookmarkInTree(result, change.bookmark);
    }
  }

  return result;
}

/**
 * 清理过期墓碑
 * 保留 30 天内的墓碑记录
 *
 * @param tombstones 墓碑列表
 * @returns 清理后的墓碑列表
 */
export function cleanExpiredTombstones(tombstones: Tombstone[]): Tombstone[] {
  const TTL = 30 * 24 * 60 * 60 * 1000; // 30 天（毫秒）
  const now = Date.now();
  const before = tombstones.length;

  const result = tombstones.filter(t => {
    const age = now - t.deletedAt;
    const isValid = age < TTL;
    if (!isValid) {
      logger.debug('清理过期墓碑', { id: t.id, ageDays: Math.floor(age / (24 * 60 * 60 * 1000)) });
    }
    return isValid;
  });

  if (before !== result.length) {
    logger.info('清理过期墓碑完成', { before, after: result.length });
  }

  return result;
}

/**
 * 为删除的书签创建墓碑
 *
 * @param localChanges 本地变更
 * @param remoteChanges 远程变更
 * @param resolved 已解决的冲突
 * @returns 新创建的墓碑列表
 */
function createTombstonesForDeletions(
  localChanges: ChangeDetectionResult,
  remoteChanges: ChangeDetectionResult,
  resolved: ResolvedConflict[]
): Tombstone[] {
  const tombstones: Tombstone[] = [];
  const now = Date.now();
  const deviceIdentifier = typeof navigator !== 'undefined'
    ? `${navigator.userAgent.split(' ')[0]}`
    : 'unknown-device';

  // 本地删除的书签创建墓碑
  for (const change of localChanges.deleted) {
    if (change.bookmark.id) {
      tombstones.push({
        id: change.bookmark.id,
        deletedAt: now,
        deletedBy: deviceIdentifier
      });
    }
  }

  // 远程删除的书签创建墓碑（除非本地赢了）
  for (const change of remoteChanges.deleted) {
    if (change.bookmark.id) {
      const lostToLocal = resolved.some(r =>
        r.remote.bookmark.id === change.bookmark.id && r.winner === 'local'
      );
      if (!lostToLocal) {
        tombstones.push({
          id: change.bookmark.id,
          deletedAt: now,
          deletedBy: 'remote'
        });
      }
    }
  }

  return tombstones;
}

/**
 * 去重墓碑列表
 *
 * @param tombstones 墓碑列表
 * @returns 去重后的墓碑列表
 */
function deduplicateTombstones(tombstones: Tombstone[]): Tombstone[] {
  const tombstoneMap = new Map<string, Tombstone>();

  for (const t of tombstones) {
    const existing = tombstoneMap.get(t.id);
    if (!existing || t.deletedAt > existing.deletedAt) {
      tombstoneMap.set(t.id, t);
    }
  }

  return Array.from(tombstoneMap.values());
}
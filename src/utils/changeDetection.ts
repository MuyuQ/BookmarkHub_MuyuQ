import { BookmarkInfo } from './models';

export type ChangeType = 'created' | 'modified' | 'deleted' | 'moved';

export interface BookmarkChange {
  type: ChangeType;
  bookmark: BookmarkInfo;
  previous?: BookmarkInfo;
  timestamp: number;
}

export interface ChangeDetectionResult {
  changes: BookmarkChange[];
  created: BookmarkChange[];
  modified: BookmarkChange[];
  deleted: BookmarkChange[];
  moved: BookmarkChange[];
  hasChanges: boolean;
}

function createBookmarkMap(bookmarks: BookmarkInfo[]): Map<string, BookmarkInfo> {
  const map = new Map<string, BookmarkInfo>();
  
  function traverse(list: BookmarkInfo[]) {
    for (const b of list) {
      if (b.id) map.set(b.id, b);
      if (b.children) traverse(b.children);
    }
  }
  
  traverse(bookmarks);
  return map;
}

function hasChanged(a: BookmarkInfo, b: BookmarkInfo): boolean {
  // 注意：不比较 dateGroupModified —— 不同设备对同一节点的创建/写入时间戳
  // 必然不同，纳入比较会导致同步在设备间无限往返产生虚假"modified"变更
  return a.title !== b.title ||
         a.url !== b.url ||
         a.parentId !== b.parentId ||
         a.index !== b.index ||
         a.type !== b.type;
}

function isMoved(a: BookmarkInfo, b: BookmarkInfo): boolean {
  return a.parentId !== b.parentId || a.index !== b.index;
}

/**
 * P0-1: 将"同 URL 的 deleted + created"重分类为 moved
 *
 * 书签稳定 ID 包含父路径，跨目录移动在新 ID 方案下不再共享同一 ID，
 * 会被检测为 deleted + created。按 URL 配对还原 moved 语义：
 * - 移动不再产生墓碑（否则移动会被 30 天墓碑压制，移回即被误杀）
 * - previous 保留旧路径节点，合并层据此移除旧位置
 * 只配对带 URL 的节点（文件夹 ID 方案本就随路径变化，维持现状）。
 * 直接修改传入的数组。
 */
function reclassifyCrossFolderMoves(
  created: BookmarkChange[],
  deleted: BookmarkChange[],
  moved: BookmarkChange[],
  now: number
): void {
  if (created.length === 0 || deleted.length === 0) return;

  const createdByUrl = new Map<string, BookmarkChange>();
  for (const c of created) {
    if (c.bookmark.url && !createdByUrl.has(c.bookmark.url)) {
      createdByUrl.set(c.bookmark.url, c);
    }
  }
  if (createdByUrl.size === 0) return;

  const consumedCreated = new Set<BookmarkChange>();
  const consumedDeleted = new Set<BookmarkChange>();
  const reclassified: BookmarkChange[] = [];

  for (const d of deleted) {
    if (!d.bookmark.url) continue;
    const c = createdByUrl.get(d.bookmark.url);
    if (!c || consumedCreated.has(c)) continue;
    consumedCreated.add(c);
    consumedDeleted.add(d);
    reclassified.push({
      type: 'moved',
      bookmark: c.bookmark,
      previous: d.bookmark,
      timestamp: now,
    });
  }

  if (reclassified.length === 0) return;

  const keptCreated = created.filter(c => !consumedCreated.has(c));
  const keptDeleted = deleted.filter(d => !consumedDeleted.has(d));
  created.length = 0;
  created.push(...keptCreated);
  deleted.length = 0;
  deleted.push(...keptDeleted);
  moved.push(...reclassified);
}

export function detectChanges(
  oldBookmarks: BookmarkInfo[],
  newBookmarks: BookmarkInfo[]
): ChangeDetectionResult {
  const oldMap = createBookmarkMap(oldBookmarks);
  const newMap = createBookmarkMap(newBookmarks);
  
  const created: BookmarkChange[] = [];
  const modified: BookmarkChange[] = [];
  const deleted: BookmarkChange[] = [];
  const moved: BookmarkChange[] = [];
  
  const now = Date.now();
  
  for (const [id, bookmark] of newMap) {
    if (!oldMap.has(id)) {
      created.push({
        type: 'created',
        bookmark,
        timestamp: now,
      });
    } else {
      const oldBookmark = oldMap.get(id)!;
      if (hasChanged(oldBookmark, bookmark)) {
        const movedChange = isMoved(oldBookmark, bookmark);
        const modifiedChange = oldBookmark.title !== bookmark.title ||
                               oldBookmark.url !== bookmark.url;
        
        // P0-5/P0-6 Fix: Make categories mutually exclusive
        // Priority: modified > moved (content changes are more significant)
        // A bookmark that has both content and position changes is classified as "modified"
        if (modifiedChange) {
          modified.push({
            type: 'modified',
            bookmark,
            previous: oldBookmark,
            timestamp: now,
          });
        } else if (movedChange) {
          moved.push({
            type: 'moved',
            bookmark,
            previous: oldBookmark,
            timestamp: now,
          });
        }
      }
    }
  }
  
  for (const [id, bookmark] of oldMap) {
    if (!newMap.has(id)) {
      deleted.push({
        type: 'deleted',
        bookmark,
        timestamp: now,
      });
    }
  }

  // P0-1: 书签 ID 包含父路径，跨目录移动表现为"旧路径 deleted + 新路径 created"。
  // 按 URL 将二者重新配对为 moved（previous 保留旧节点供合并层移除），
  // 否则每次移动都会生成墓碑，并把目标位置压制 30 天（移回即被"误杀"）。
  reclassifyCrossFolderMoves(created, deleted, moved, now);

  const changes = [...created, ...modified, ...deleted, ...moved];
  
  return {
    changes,
    created,
    modified,
    deleted,
    moved,
    hasChanges: changes.length > 0,
  };
}

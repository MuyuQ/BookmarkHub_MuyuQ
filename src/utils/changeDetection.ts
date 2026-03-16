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
  return a.title !== b.title ||
         a.url !== b.url ||
         a.parentId !== b.parentId ||
         a.index !== b.index;
}

function isMoved(a: BookmarkInfo, b: BookmarkInfo): boolean {
  return a.parentId !== b.parentId || a.index !== b.index;
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
        
        if (movedChange) {
          moved.push({
            type: 'moved',
            bookmark,
            previous: oldBookmark,
            timestamp: now,
          });
        }
        
        if (modifiedChange) {
          modified.push({
            type: 'modified',
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

export function formatChangeSummary(result: ChangeDetectionResult): string {
  if (!result.hasChanges) {
    return '无变更';
  }
  
  const parts: string[] = [];
  if (result.created.length > 0) parts.push(`新增 ${result.created.length} 个`);
  if (result.modified.length > 0) parts.push(`修改 ${result.modified.length} 个`);
  if (result.deleted.length > 0) parts.push(`删除 ${result.deleted.length} 个`);
  if (result.moved.length > 0) parts.push(`移动 ${result.moved.length} 个`);
  
  return parts.join('，');
}
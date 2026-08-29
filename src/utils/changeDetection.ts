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

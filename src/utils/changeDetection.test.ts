import { describe, it, expect } from 'vitest'
import { detectChanges, formatChangeSummary } from './changeDetection'
import { BookmarkInfo } from './models'

describe('detectChanges', () => {
  it('should return no changes for identical bookmarks', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: '1', title: 'Folder', children: [] },
    ]

    const result = detectChanges(bookmarks, bookmarks)

    expect(result.hasChanges).toBe(false)
    expect(result.changes).toHaveLength(0)
  })

  it('should detect created bookmarks', () => {
    const oldBookmarks: BookmarkInfo[] = []
    const newBookmarks: BookmarkInfo[] = [
      { id: '1', title: 'New Bookmark', url: 'https://example.com' },
    ]

    const result = detectChanges(oldBookmarks, newBookmarks)

    expect(result.hasChanges).toBe(true)
    expect(result.created).toHaveLength(1)
    expect(result.created[0].type).toBe('created')
    expect(result.created[0].bookmark.title).toBe('New Bookmark')
  })

  it('should detect deleted bookmarks', () => {
    const oldBookmarks: BookmarkInfo[] = [
      { id: '1', title: 'Old Bookmark', url: 'https://example.com' },
    ]
    const newBookmarks: BookmarkInfo[] = []

    const result = detectChanges(oldBookmarks, newBookmarks)

    expect(result.hasChanges).toBe(true)
    expect(result.deleted).toHaveLength(1)
    expect(result.deleted[0].type).toBe('deleted')
  })

  it('should detect modified bookmarks', () => {
    const oldBookmarks: BookmarkInfo[] = [
      { id: '1', title: 'Old Title', url: 'https://example.com' },
    ]
    const newBookmarks: BookmarkInfo[] = [
      { id: '1', title: 'New Title', url: 'https://example.com' },
    ]

    const result = detectChanges(oldBookmarks, newBookmarks)

    expect(result.hasChanges).toBe(true)
    expect(result.modified).toHaveLength(1)
    expect(result.modified[0].type).toBe('modified')
  })

  it('should detect moved bookmarks', () => {
    const oldBookmarks: BookmarkInfo[] = [
      { id: '1', title: 'Bookmark', url: 'https://example.com', parentId: 'folder1' },
    ]
    const newBookmarks: BookmarkInfo[] = [
      { id: '1', title: 'Bookmark', url: 'https://example.com', parentId: 'folder2' },
    ]

    const result = detectChanges(oldBookmarks, newBookmarks)

    expect(result.hasChanges).toBe(true)
    expect(result.moved).toHaveLength(1)
    expect(result.moved[0].type).toBe('moved')
  })

  it('should handle nested bookmarks', () => {
    const oldBookmarks: BookmarkInfo[] = [
      {
        id: 'folder1',
        title: 'Folder',
        children: [
          { id: '1', title: 'Bookmark 1', url: 'https://example1.com' },
        ],
      },
    ]
    const newBookmarks: BookmarkInfo[] = [
      {
        id: 'folder1',
        title: 'Folder',
        children: [
          { id: '1', title: 'Bookmark 1', url: 'https://example1.com' },
          { id: '2', title: 'Bookmark 2', url: 'https://example2.com' },
        ],
      },
    ]

    const result = detectChanges(oldBookmarks, newBookmarks)

    expect(result.hasChanges).toBe(true)
    expect(result.created).toHaveLength(1)
  })
})

describe('formatChangeSummary', () => {
  it('should return "无变更" for no changes', () => {
    const result = {
      changes: [],
      created: [],
      modified: [],
      deleted: [],
      moved: [],
      hasChanges: false,
    }

    expect(formatChangeSummary(result)).toBe('无变更')
  })

  it('should format multiple change types', () => {
    const result = {
      changes: [],
      created: [{ type: 'created' as const, bookmark: {} as BookmarkInfo, timestamp: 0 }],
      modified: [{ type: 'modified' as const, bookmark: {} as BookmarkInfo, timestamp: 0 }],
      deleted: [],
      moved: [],
      hasChanges: true,
    }

    const summary = formatChangeSummary(result)
    expect(summary).toContain('新增 1 个')
    expect(summary).toContain('修改 1 个')
  })
})
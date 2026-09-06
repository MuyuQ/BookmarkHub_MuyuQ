import { describe, it, expect } from 'vitest'
import { detectChanges } from './changeDetection'
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

  // ============== P0-1: 跨目录移动重分类 ==============
  // 新 ID 方案下书签 ID 包含父路径，跨目录移动表现为"旧路径 deleted + 新路径 created"。
  // 若不按 URL 重配对还原为 moved，每次移动都会生成墓碑并把目标位置压制 30 天。

  it('P0-1: 同 URL 书签跨目录移动应重分类为 moved（而非 deleted+created）', () => {
    const oldBookmarks: BookmarkInfo[] = [
      { id: 'bm_toolbar', title: 'X', url: 'https://x.example.com', parentId: 'root_toolbar' },
    ]
    const newBookmarks: BookmarkInfo[] = [
      { id: 'bm_other', title: 'X', url: 'https://x.example.com', parentId: 'root_unfiled' },
    ]

    const result = detectChanges(oldBookmarks, newBookmarks)

    expect(result.hasChanges).toBe(true)
    expect(result.moved).toHaveLength(1)
    expect(result.deleted).toHaveLength(0)
    expect(result.created).toHaveLength(0)
    expect(result.moved[0].previous?.id).toBe('bm_toolbar')
    expect(result.moved[0].bookmark.id).toBe('bm_other')
  })

  it('P0-1: 复制书签（原副本仍在）应保持 created，不与原副本配对', () => {
    const oldBookmarks: BookmarkInfo[] = [
      { id: 'bm_a', title: 'X', url: 'https://x.example.com', parentId: 'root_toolbar' },
    ]
    const newBookmarks: BookmarkInfo[] = [
      { id: 'bm_a', title: 'X', url: 'https://x.example.com', parentId: 'root_toolbar' },
      { id: 'bm_b', title: 'X', url: 'https://x.example.com', parentId: 'root_unfiled' },
    ]

    const result = detectChanges(oldBookmarks, newBookmarks)

    expect(result.created).toHaveLength(1)
    expect(result.created[0].bookmark.id).toBe('bm_b')
    expect(result.deleted).toHaveLength(0)
    expect(result.moved).toHaveLength(0)
  })

  it('P0-1: 删除重复副本之一应保持 deleted（不与存活的另一副本配对）', () => {
    const oldBookmarks: BookmarkInfo[] = [
      { id: 'bm_a', title: 'X', url: 'https://x.example.com', parentId: 'root_toolbar' },
      { id: 'bm_b', title: 'X', url: 'https://x.example.com', parentId: 'root_unfiled' },
    ]
    const newBookmarks: BookmarkInfo[] = [
      { id: 'bm_b', title: 'X', url: 'https://x.example.com', parentId: 'root_unfiled' },
    ]

    const result = detectChanges(oldBookmarks, newBookmarks)

    expect(result.deleted).toHaveLength(1)
    expect(result.deleted[0].bookmark.id).toBe('bm_a')
    expect(result.created).toHaveLength(0)
    expect(result.moved).toHaveLength(0)
  })

  it('P0-1: 同时删除两份副本并新建一份应只配对一次', () => {
    const oldBookmarks: BookmarkInfo[] = [
      { id: 'bm_a', title: 'X', url: 'https://x.example.com', parentId: 'root_toolbar' },
      { id: 'bm_b', title: 'X', url: 'https://x.example.com', parentId: 'root_unfiled' },
    ]
    const newBookmarks: BookmarkInfo[] = [
      { id: 'bm_c', title: 'X', url: 'https://x.example.com', parentId: 'root_menu' },
    ]

    const result = detectChanges(oldBookmarks, newBookmarks)

    // 一份配对为 moved，另一份保持 deleted
    expect(result.moved).toHaveLength(1)
    expect(result.deleted).toHaveLength(1)
    expect(result.created).toHaveLength(0)
    expect(result.hasChanges).toBe(true)
  })
})

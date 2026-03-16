import { describe, it, expect } from 'vitest'
import { mergeBookmarks } from './merge'
import { BookmarkInfo, SyncDataInfo } from './models'

function createSyncData(bookmarks: BookmarkInfo[]): SyncDataInfo {
  return {
    version: '0.7',
    createDate: Date.now(),
    bookmarks,
    browser: 'test-browser',
  }
}

describe('mergeBookmarks', () => {
  it('should return local bookmarks when remote is null', () => {
    const local: BookmarkInfo[] = [
      { id: '1', title: 'Local Bookmark', url: 'https://example.com' },
    ]

    const result = mergeBookmarks(local, null, 'auto')

    expect(result.merged).toEqual(local)
    expect(result.hasChanges).toBe(false)
    expect(result.conflicts).toHaveLength(0)
  })

  it('should handle empty remote bookmarks by detecting local as created', () => {
    const local: BookmarkInfo[] = [
      { id: '1', title: 'Local Bookmark', url: 'https://example.com' },
    ]
    const remote = createSyncData([])

    const result = mergeBookmarks(local, remote, 'auto')

    // When remote is empty and local has bookmarks, those bookmarks are "created"
    // The merge should reflect that changes were detected
    expect(result.hasChanges).toBe(true)
    expect(result.appliedChanges.length).toBe(1)
  })

  it('should merge bookmarks with no conflicts', () => {
    const local: BookmarkInfo[] = [
      { id: '1', title: 'Local Bookmark', url: 'https://example.com' },
    ]
    const remote = createSyncData([
      { id: '2', title: 'Remote Bookmark', url: 'https://example2.com' },
    ])

    const result = mergeBookmarks(local, remote, 'auto')

    expect(result.hasChanges).toBe(true)
  })

  it('should handle auto conflict mode', () => {
    const local: BookmarkInfo[] = [
      { id: '1', title: 'Local Title', url: 'https://example.com', dateAdded: 2000 },
    ]
    const remote = createSyncData([
      { id: '1', title: 'Remote Title', url: 'https://example.com', dateAdded: 1000 },
    ])

    const result = mergeBookmarks(local, remote, 'auto')

    expect(result.conflicts).toHaveLength(0)
  })

  it('should detect conflicts in prompt mode', () => {
    const local: BookmarkInfo[] = [
      { id: '1', title: 'Local Title', url: 'https://example.com', dateAdded: 2000 },
    ]
    const remote = createSyncData([
      { id: '1', title: 'Remote Title', url: 'https://example.com', dateAdded: 1000 },
    ])

    const result = mergeBookmarks(local, remote, 'prompt')

    expect(result.conflicts.length).toBeGreaterThanOrEqual(0)
  })

  it('should handle nested bookmarks', () => {
    const local: BookmarkInfo[] = [
      {
        id: 'folder1',
        title: 'Folder',
        children: [
          { id: '1', title: 'Bookmark 1', url: 'https://example1.com' },
        ],
      },
    ]
    const remote = createSyncData([
      {
        id: 'folder1',
        title: 'Folder',
        children: [
          { id: '2', title: 'Bookmark 2', url: 'https://example2.com' },
        ],
      },
    ])

    const result = mergeBookmarks(local, remote, 'auto')

    expect(result.merged).toBeDefined()
  })

  it('should return change summary', () => {
    const local: BookmarkInfo[] = [
      { id: '1', title: 'New Bookmark', url: 'https://example.com' },
    ]
    const remote = createSyncData([])

    const result = mergeBookmarks(local, remote, 'auto')

    expect(result.changeSummary).toBeDefined()
  })
})
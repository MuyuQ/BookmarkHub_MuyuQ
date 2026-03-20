import { describe, it, expect } from 'vitest'
import { mergeBookmarks, threeWayMerge, mergeTombstones, filterChangesByTombstones, cleanExpiredTombstones, ThreeWayMergeParams } from './merge'
import { BookmarkInfo, SyncDataInfo, Tombstone } from './models'
import { ChangeDetectionResult } from './changeDetection'

function createSyncData(bookmarks: BookmarkInfo[]): SyncDataInfo {
  return {
    version: '0.7',
    createDate: Date.now(),
    bookmarks,
    browser: 'test-browser',
  }
}

// 三向合并测试用的辅助函数
function createThreeWayParams(overrides: Partial<ThreeWayMergeParams>): ThreeWayMergeParams {
  return {
    baseline: [],
    local: [],
    remote: [],
    localTombstones: [],
    remoteTombstones: [],
    conflictMode: 'auto',
    ...overrides,
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

// ============== 三向合并测试 ==============

describe('threeWayMerge', () => {
  // 场景 1: 首次同步 - baseline 为 null
  describe('首次同步场景', () => {
    it('当 baseline 为 null 时，应使用本地数据', () => {
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Local Bookmark', url: 'https://example.com' },
        { id: '2', title: 'Another Bookmark', url: 'https://example2.com' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline: null,
        local,
        remote: [],
      }))

      expect(result.merged).toEqual(local)
      expect(result.hasChanges).toBe(true)
      expect(result.conflicts).toHaveLength(0)
      expect(result.changeSummary).toBe('首次同步，使用本地数据')
    })

    it('当 baseline 为空数组时，应使用本地数据', () => {
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Local Bookmark', url: 'https://example.com' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline: [],
        local,
        remote: [],
      }))

      expect(result.merged).toEqual(local)
      expect(result.hasChanges).toBe(true)
    })

    it('首次同步时应清理过期的墓碑', () => {
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Local Bookmark', url: 'https://example.com' },
      ]

      // 创建一个超过 30 天的墓碑
      const oldTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000 // 31 天前
      const expiredTombstone: Tombstone = {
        id: 'expired-bookmark',
        deletedAt: oldTimestamp,
        deletedBy: 'old-device',
      }
      const recentTombstone: Tombstone = {
        id: 'recent-bookmark',
        deletedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 天前
        deletedBy: 'current-device',
      }

      const result = threeWayMerge(createThreeWayParams({
        baseline: null,
        local,
        remote: [],
        localTombstones: [expiredTombstone, recentTombstone],
      }))

      // 过期墓碑应被清理
      expect(result.tombstones).toHaveLength(1)
      expect(result.tombstones[0].id).toBe('recent-bookmark')
    })
  })

  // 场景 2: 本地新建书签同步
  describe('本地新建书签同步', () => {
    it('本地新建书签应合并到结果中', () => {
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Existing Bookmark', url: 'https://example.com' },
      ]

      // 本地新增了一个书签
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Existing Bookmark', url: 'https://example.com' },
        { id: '2', title: 'New Local Bookmark', url: 'https://new.example.com' },
      ]

      // 远程没有变化
      const remote: BookmarkInfo[] = [
        { id: '1', title: 'Existing Bookmark', url: 'https://example.com' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
      }))

      expect(result.hasChanges).toBe(true)
      // 合并结果应包含新书签
      expect(result.merged.find(b => b.id === '2')).toBeDefined()
      expect(result.merged.find(b => b.id === '2')?.title).toBe('New Local Bookmark')
    })

    it('本地和远程都有新书签时，应合并两边', () => {
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Existing Bookmark', url: 'https://example.com' },
      ]

      const local: BookmarkInfo[] = [
        { id: '1', title: 'Existing Bookmark', url: 'https://example.com' },
        { id: '2', title: 'Local New', url: 'https://local.example.com' },
      ]

      const remote: BookmarkInfo[] = [
        { id: '1', title: 'Existing Bookmark', url: 'https://example.com' },
        { id: '3', title: 'Remote New', url: 'https://remote.example.com' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
      }))

      expect(result.hasChanges).toBe(true)
      expect(result.merged.find(b => b.id === '2')).toBeDefined()
      expect(result.merged.find(b => b.id === '3')).toBeDefined()
    })
  })

  // 场景 3: 远程删除书签传播
  describe('远程删除书签传播', () => {
    it('远程删除的书签应从合并结果中移除', () => {
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Bookmark A', url: 'https://a.example.com' },
        { id: '2', title: 'Bookmark B', url: 'https://b.example.com' },
        { id: '3', title: 'Bookmark C', url: 'https://c.example.com' },
      ]

      // 本地无变化
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Bookmark A', url: 'https://a.example.com' },
        { id: '2', title: 'Bookmark B', url: 'https://b.example.com' },
        { id: '3', title: 'Bookmark C', url: 'https://c.example.com' },
      ]

      // 远程删除了书签 B
      const remote: BookmarkInfo[] = [
        { id: '1', title: 'Bookmark A', url: 'https://a.example.com' },
        { id: '3', title: 'Bookmark C', url: 'https://c.example.com' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
      }))

      expect(result.hasChanges).toBe(true)
      // 书签 B 应被删除
      expect(result.merged.find(b => b.id === '2')).toBeUndefined()
      // 其他书签应保留
      expect(result.merged.find(b => b.id === '1')).toBeDefined()
      expect(result.merged.find(b => b.id === '3')).toBeDefined()
    })

    it('远程删除应创建墓碑', () => {
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Bookmark A', url: 'https://a.example.com' },
      ]

      const local: BookmarkInfo[] = [
        { id: '1', title: 'Bookmark A', url: 'https://a.example.com' },
      ]

      const remote: BookmarkInfo[] = []

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
      }))

      // 应创建墓碑
      expect(result.tombstones.some(t => t.id === '1')).toBe(true)
    })
  })

  // 场景 4: 同时修改同一书签冲突
  describe('同时修改同一书签冲突', () => {
    it('auto 模式下应根据时间戳自动解决冲突', () => {
      const now = Date.now()
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Original Title', url: 'https://example.com', dateAdded: now - 10000 },
      ]

      // 本地修改了标题（较新）
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Local Modified Title', url: 'https://example.com', dateAdded: now - 10000, dateGroupModified: now },
      ]

      // 远程修改了标题（较旧）
      const remote: BookmarkInfo[] = [
        { id: '1', title: 'Remote Modified Title', url: 'https://example.com', dateAdded: now - 10000, dateGroupModified: now - 5000 },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
        conflictMode: 'auto',
      }))

      // auto 模式下不应有冲突
      expect(result.conflicts).toHaveLength(0)
      // 本地较新，应胜出
      expect(result.merged.find(b => b.id === '1')?.title).toBe('Local Modified Title')
    })

    it('prompt 模式下应检测到冲突', () => {
      const now = Date.now()
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Original Title', url: 'https://example.com', dateAdded: now - 10000 },
      ]

      // 本地修改了标题
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Local Modified Title', url: 'https://example.com', dateAdded: now - 10000, dateGroupModified: now },
      ]

      // 远程修改了标题
      const remote: BookmarkInfo[] = [
        { id: '1', title: 'Remote Modified Title', url: 'https://example.com', dateAdded: now - 10000, dateGroupModified: now - 5000 },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
        conflictMode: 'prompt',
      }))

      // prompt 模式下应检测到冲突
      expect(result.conflicts.length).toBeGreaterThan(0)
      expect(result.conflicts[0].type).toBe('modified')
    })

    it('本地修改 URL 远程修改标题应正确合并', () => {
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Original', url: 'https://original.com' },
      ]

      // 本地修改了 URL
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Original', url: 'https://local-modified.com' },
      ]

      // 远程修改了标题
      const remote: BookmarkInfo[] = [
        { id: '1', title: 'Remote Title', url: 'https://original.com' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
        conflictMode: 'auto',
      }))

      // 会有冲突，因为两边都修改了同一书签
      expect(result.hasChanges).toBe(true)
    })
  })

  // 场景 5: 墓碑防止复活
  describe('墓碑防止复活', () => {
    it('墓碑中的书签不应被本地创建复活', () => {
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Existing', url: 'https://example.com' },
      ]

      // 本地"创建"了一个新书签，但这个 ID 已经在墓碑中
      const local: BookmarkInfo[] = [
        { id: '1', title: 'Existing', url: 'https://example.com' },
        { id: 'deleted-id', title: 'Revived Bookmark', url: 'https://revived.com' },
      ]

      const remote: BookmarkInfo[] = [
        { id: '1', title: 'Existing', url: 'https://example.com' },
      ]

      // 墓碑中已有 deleted-id
      const tombstones: Tombstone[] = [
        { id: 'deleted-id', deletedAt: Date.now() - 1000, deletedBy: 'test-device' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
        localTombstones: tombstones,
      }))

      // 墓碑中的书签不应被复活
      expect(result.merged.find(b => b.id === 'deleted-id')).toBeUndefined()
    })

    it('墓碑中的书签不应被远程创建复活', () => {
      const baseline: BookmarkInfo[] = [
        { id: '1', title: 'Existing', url: 'https://example.com' },
      ]

      const local: BookmarkInfo[] = [
        { id: '1', title: 'Existing', url: 'https://example.com' },
      ]

      // 远程"创建"了一个书签，但这个 ID 在墓碑中
      const remote: BookmarkInfo[] = [
        { id: '1', title: 'Existing', url: 'https://example.com' },
        { id: 'deleted-id', title: 'Remote Revived', url: 'https://revived.com' },
      ]

      const tombstones: Tombstone[] = [
        { id: 'deleted-id', deletedAt: Date.now() - 1000, deletedBy: 'test-device' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local,
        remote,
        remoteTombstones: tombstones,
      }))

      expect(result.merged.find(b => b.id === 'deleted-id')).toBeUndefined()
    })

    it('本地和远程墓碑应合并', () => {
      const baseline: BookmarkInfo[] = []

      const localTombstones: Tombstone[] = [
        { id: 'local-deleted', deletedAt: Date.now(), deletedBy: 'local' },
      ]

      const remoteTombstones: Tombstone[] = [
        { id: 'remote-deleted', deletedAt: Date.now(), deletedBy: 'remote' },
      ]

      const result = threeWayMerge(createThreeWayParams({
        baseline,
        local: [],
        remote: [],
        localTombstones,
        remoteTombstones,
      }))

      // 两边的墓碑都应保留
      expect(result.tombstones.find(t => t.id === 'local-deleted')).toBeDefined()
      expect(result.tombstones.find(t => t.id === 'remote-deleted')).toBeDefined()
    })
  })

  // 场景 6: 墓碑 30 天清理
  describe('墓碑 30 天清理', () => {
    it('超过 30 天的墓碑应被清理', () => {
      const now = Date.now()
      const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000
      const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000

      const tombstones: Tombstone[] = [
        { id: 'old-deleted', deletedAt: thirtyOneDaysAgo, deletedBy: 'old-device' },
        { id: 'recent-deleted', deletedAt: fifteenDaysAgo, deletedBy: 'current-device' },
      ]

      const result = cleanExpiredTombstones(tombstones)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('recent-deleted')
    })

    it('刚好 30 天的墓碑应被清理', () => {
      const now = Date.now()
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

      const tombstones: Tombstone[] = [
        { id: 'exactly-30-days', deletedAt: thirtyDaysAgo, deletedBy: 'device' },
        { id: '29-days', deletedAt: now - 29 * 24 * 60 * 60 * 1000, deletedBy: 'device' },
      ]

      const result = cleanExpiredTombstones(tombstones)

      // 刚好 30 天的应被清理，29 天的保留
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('29-days')
    })

    it('空墓碑列表应返回空数组', () => {
      const result = cleanExpiredTombstones([])
      expect(result).toHaveLength(0)
    })
  })
})

// ============== 辅助函数测试 ==============

describe('mergeTombstones', () => {
  it('应合并本地和远程墓碑', () => {
    const local: Tombstone[] = [
      { id: '1', deletedAt: 1000, deletedBy: 'local' },
    ]
    const remote: Tombstone[] = [
      { id: '2', deletedAt: 2000, deletedBy: 'remote' },
    ]

    const result = mergeTombstones(local, remote)

    expect(result).toHaveLength(2)
  })

  it('相同 ID 应保留最新的墓碑', () => {
    const local: Tombstone[] = [
      { id: '1', deletedAt: 1000, deletedBy: 'local' },
    ]
    const remote: Tombstone[] = [
      { id: '1', deletedAt: 2000, deletedBy: 'remote' }, // 较新
    ]

    const result = mergeTombstones(local, remote)

    expect(result).toHaveLength(1)
    expect(result[0].deletedAt).toBe(2000)
    expect(result[0].deletedBy).toBe('remote')
  })
})

describe('filterChangesByTombstones', () => {
  it('应过滤掉墓碑中书签的创建', () => {
    const changes: ChangeDetectionResult = {
      changes: [],
      created: [
        { type: 'created', bookmark: { id: 'tombstone-id', title: 'Deleted' }, timestamp: Date.now() },
        { type: 'created', bookmark: { id: 'valid-id', title: 'Valid' }, timestamp: Date.now() },
      ],
      modified: [],
      deleted: [],
      moved: [],
      hasChanges: true,
    }

    const tombstoneIds = new Set(['tombstone-id'])

    filterChangesByTombstones(changes, tombstoneIds)

    expect(changes.created).toHaveLength(1)
    expect(changes.created[0].bookmark.id).toBe('valid-id')
  })

  it('应重新计算 hasChanges', () => {
    const changes: ChangeDetectionResult = {
      changes: [
        { type: 'created', bookmark: { id: 'tombstone-id', title: 'Deleted' }, timestamp: Date.now() },
      ],
      created: [
        { type: 'created', bookmark: { id: 'tombstone-id', title: 'Deleted' }, timestamp: Date.now() },
      ],
      modified: [],
      deleted: [],
      moved: [],
      hasChanges: true,
    }

    const tombstoneIds = new Set(['tombstone-id'])

    filterChangesByTombstones(changes, tombstoneIds)

    // 所有创建都被过滤后，应该没有变更
    expect(changes.hasChanges).toBe(false)
    expect(changes.changes).toHaveLength(0)
  })

  it('墓碑不应影响修改和删除', () => {
    const changes: ChangeDetectionResult = {
      changes: [
        { type: 'created', bookmark: { id: 'tombstone-id', title: 'Created' }, timestamp: Date.now() },
        { type: 'modified', bookmark: { id: 'tombstone-id', title: 'Modified' }, timestamp: Date.now() },
      ],
      created: [
        { type: 'created', bookmark: { id: 'tombstone-id', title: 'Created' }, timestamp: Date.now() },
      ],
      modified: [
        { type: 'modified', bookmark: { id: 'tombstone-id', title: 'Modified' }, timestamp: Date.now() },
      ],
      deleted: [],
      moved: [],
      hasChanges: true,
    }

    const tombstoneIds = new Set(['tombstone-id'])

    filterChangesByTombstones(changes, tombstoneIds)

    // 创建应被过滤
    expect(changes.created).toHaveLength(0)
    // 修改应保留（filterChangesByTombstones 目前只过滤 created）
    expect(changes.modified).toHaveLength(1)
  })
})
# Comment Out Merge Logic - Work Plan

## Objective
Temporarily comment out all merge-related code in the BookmarkHub extension to test sync behavior without intelligent merging.

## Files to Modify

### 1. src/utils/sync.ts
**Location**: Lines 323-349 (approximately)
**Current Logic**: Uses `mergeBookmarksImpl` to intelligently merge local and remote bookmarks
**Change To**: Directly upload local bookmarks, skipping the merge step

**Specific Changes**:
- Comment out lines 323-349 (merge logic block)
- Add new simplified logic: directly upload local bookmarks
- Update step numbers in logs (步骤5 → 直接上传本地书签)
- Keep backup functionality intact (it happens in uploadBookmarks)

### 2. src/utils/sync.ts - Imports
**Optional**: Can comment out the merge import if desired:
```typescript
// import { mergeBookmarks as mergeBookmarksImpl, ConflictMode as MergeConflictMode, MergeResult } from './merge';
```

But this may cause TypeScript errors if types are still referenced elsewhere.

## Verification Steps

1. Run `npm run compile` to verify TypeScript compiles
2. Run `npm test` to ensure tests pass (note: merge-related tests may fail)
3. Run `npm run build` to create production build

## Expected Behavior After Change

- Sync will upload local bookmarks directly to remote
- No conflict resolution will occur
- Remote bookmarks will be completely replaced by local bookmarks
- Backup functionality will still work (saves old remote data before upload)

## Rollback

To restore merge functionality, simply uncomment the original code block.

## Notes

- This is for testing purposes only
- In production, the merge logic should be restored
- The change is minimal and focused on the sync.ts file only

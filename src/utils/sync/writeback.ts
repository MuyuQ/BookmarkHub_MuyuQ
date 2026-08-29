/**
 * 合并结果写回模块 (P0-2)
 *
 * 将三向合并的结果 diff 应用回本地浏览器书签树。
 * 若不写回，merged 中"仅远程存在的书签"在下次同步时会被
 * detectChanges 误判为本地删除并生成墓碑，导致远程书签被误杀。
 */

import { BookmarkInfo } from '../models';
import { normalizeBookmarkIds, normalizeTreeShape, generateStableId, isStructuralRootId } from '../bookmarkUtils';
import { detectBookmarkBrowserType, resolveRootTargetBrowserId } from '../browserInfo';
import { logger } from '../logger';

/**
 * 获取剥根并标准化后的本地书签树
 * 所有同步路径统一使用该形态（与远程数据格式一致）
 */
export async function getLocalBookmarkTree(): Promise<BookmarkInfo[]> {
    const tree = await browser.bookmarks.getTree();
    const stripped = normalizeTreeShape(tree as unknown as BookmarkInfo[]);
    return normalizeBookmarkIds(stripped);
}

/** 本地书签节点的引用信息（稳定 ID ↔ 浏览器 ID 映射） */
interface BookmarkNodeRef {
    browserId: string;
    stableId: string;
    parentBrowserId?: string;
    parentStableId?: string;
    title: string;
    url?: string;
    index?: number;
    depth: number;
}

/**
 * 遍历本地书签树，建立 stableId → 浏览器节点引用 的映射
 * 不修改原节点（浏览器 ID 需要保留用于 API 调用）
 */
function collectLocalRefs(
    nodes: BookmarkInfo[],
    parentBrowserId: string | undefined,
    parentStableId: string | undefined,
    parentPath: string,
    depth: number,
    out: Map<string, BookmarkNodeRef>
): void {
    for (const node of nodes) {
        const stableId = generateStableId(node, parentPath);
        out.set(stableId, {
            browserId: node.id || '',
            stableId,
            parentBrowserId,
            parentStableId,
            title: node.title,
            url: node.url,
            index: node.index,
            depth,
        });
        if (node.children) {
            const childPath = parentPath ? `${parentPath}/${node.title}` : node.title;
            collectLocalRefs(node.children, node.id || parentBrowserId, stableId, childPath, depth + 1, out);
        }
    }
}

/** 写回操作统计 */
export interface WritebackStats {
    created: number;
    removed: number;
    updated: number;
    moved: number;
    failed: number;
}

/**
 * 将合并结果应用回本地浏览器书签树
 *
 * 三向合并完成后，merged 包含双方的所有变更，但本地浏览器书签树
 * 并不会自动更新——若不写回，merged 中"仅远程存在的书签"在下次同步时
 * 会被 detectChanges 误判为本地删除并生成墓碑，导致远程书签被误杀。
 *
 * 执行顺序：删除（子先于父）→ 创建（父先于子）→ 更新/移动。
 * 必须在 beginBulkBookmarkOperation 保护区和事件抑制状态下调用。
 *
 * @param merged - 合并后的书签树（已标准化稳定 ID，剥根格式）
 */
export async function applyMergeToLocalTree(merged: BookmarkInfo[]): Promise<WritebackStats> {
    const stats: WritebackStats = { created: 0, removed: 0, updated: 0, moved: 0, failed: 0 };

    // 建立本地树映射
    const rawTree = await browser.bookmarks.getTree();
    const localRefs = new Map<string, BookmarkNodeRef>();
    const stripped = normalizeTreeShape(rawTree as unknown as BookmarkInfo[]);
    collectLocalRefs(stripped, rawTree[0]?.id, undefined, '', 0, localRefs);

    // 建立 merged 索引（节点 ID 已标准化）
    const mergedNodes = new Map<string, BookmarkInfo>();
    const mergedParentOf = new Map<string, string | undefined>();
    (function index(nodes: BookmarkInfo[], parentStableId?: string): void {
        for (const node of nodes) {
            if (!node.id) continue;
            mergedNodes.set(node.id, node);
            mergedParentOf.set(node.id, parentStableId);
            if (node.children) index(node.children, node.id);
        }
    })(merged, undefined);

    // 1. 删除：本地存在但合并结果中不存在（深度降序，子先于父）
    const localList = [...localRefs.values()].sort((a, b) => b.depth - a.depth);
    for (const ref of localList) {
        if (isStructuralRootId(ref.browserId)) continue;
        if (!mergedNodes.has(ref.stableId)) {
            try {
                await browser.bookmarks.removeTree(ref.browserId);
                stats.removed++;
            } catch (err) {
                // 可能已随父级删除，忽略
                logger.debug('writeback: remove failed (可能已随父级删除)', { id: ref.browserId, err });
            }
        }
    }

    // 2. 创建：合并结果中存在但本地不存在（父先于子）
    const browserType = await detectBookmarkBrowserType();
    const createMissing = async (nodes: BookmarkInfo[], parentBrowserId: string): Promise<void> => {
        for (const node of nodes) {
            if (!node.id) continue;
            const existingRef = localRefs.get(node.id);
            if (existingRef) {
                if (node.children) {
                    await createMissing(node.children, existingRef.browserId);
                }
                continue;
            }
            try {
                const created = await browser.bookmarks.create({
                    parentId: parentBrowserId,
                    title: node.title,
                    url: node.url,
                    index: node.index,
                });
                stats.created++;
                localRefs.set(node.id, {
                    browserId: created.id,
                    stableId: node.id,
                    parentBrowserId,
                    title: node.title,
                    url: node.url,
                    depth: 0,
                });
                logger.debug('writeback: created', { title: node.title, parentId: parentBrowserId });
                if (node.children) {
                    await createMissing(node.children, created.id);
                }
            } catch (err) {
                stats.failed++;
                logger.warn('writeback: create failed', { id: node.id, title: node.title, err });
            }
        }
    };
    for (const topNode of merged) {
        if (!topNode.id) continue;
        const existingRef = localRefs.get(topNode.id);
        if (existingRef) {
            if (topNode.children) {
                await createMissing(topNode.children, existingRef.browserId);
            }
        } else {
            await createMissing([topNode], resolveRootTargetBrowserId(topNode, browserType));
        }
    }

    // 3. 更新与移动
    for (const [stableId, node] of mergedNodes) {
        const ref = localRefs.get(stableId);
        if (!ref || !ref.browserId) continue;
        if (isStructuralRootId(ref.browserId)) continue;

        // 内容更新
        const contentChanged = ref.title !== node.title || (ref.url || undefined) !== (node.url || undefined);
        if (contentChanged) {
            try {
                const changes: { title: string; url?: string } = { title: node.title };
                if (node.url) changes.url = node.url;
                await browser.bookmarks.update(ref.browserId, changes);
                stats.updated++;
            } catch (err) {
                stats.failed++;
                logger.warn('writeback: update failed', { id: ref.browserId, err });
            }
        }

        // 移动（父变化或位置变化）
        const targetParentStableId = mergedParentOf.get(stableId);
        let moveTarget: { parentId?: string; index?: number } | null = null;
        if (targetParentStableId !== ref.parentStableId) {
            const parentRef = targetParentStableId ? localRefs.get(targetParentStableId) : undefined;
            const parentId = parentRef?.browserId ?? resolveRootTargetBrowserId(node, browserType);
            moveTarget = { parentId, index: node.index };
        } else if (node.index !== undefined && node.index !== ref.index) {
            moveTarget = { parentId: ref.parentBrowserId, index: node.index };
        }
        if (moveTarget) {
            try {
                await browser.bookmarks.move(ref.browserId, moveTarget);
                stats.moved++;
            } catch (err) {
                logger.debug('writeback: move failed', { id: ref.browserId, err });
            }
        }
    }

    logger.info(`applyMergeToLocalTree: 写回完成`, { ...stats });
    return stats;
}


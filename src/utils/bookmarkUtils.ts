/**
 * BookmarkHub 书签工具函数集合
 * 
 * 提供书签操作的通用方法，包括：
 * - 书签数量统计
 * - 书签树格式化
 * - 书签树扁平化
 * 
 * 这个模块统一了项目中所有书签操作逻辑，避免代码重复
 */

import { BookmarkInfo } from './models';
import { ROOT_NODE_IDS, ROOT_FOLDER_NAMES } from './constants';

/**
 * 简单字符串哈希函数
 * 将字符串转换为稳定的数字哈希值
 */
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * 旧版自动同步产生的"合成根节点"的稳定 ID
 * （对虚拟根节点执行 normalizeBookmarkIds 时，title 为空串 → folder_hash('') = folder_0）
 */
export const SYNTHETIC_ROOT_ID = 'folder_0';

/** 顶层根文件夹的类型化稳定 ID 前缀（跨语言一致，不依赖本地化标题） */
const ROOT_TYPE_IDS = {
    TOOLBAR: 'root_toolbar',
    MENU: 'root_menu',
    UNFILED: 'root_unfiled',
    MOBILE: 'root_mobile',
} as const;

/**
 * 根据标题识别根文件夹类型，返回类型化稳定 ID
 * 顶层根文件夹的标题随浏览器语言变化（书签栏/Bookmarks Bar/Leseleiste...），
 * 使用类型化 ID 保证跨设备、跨语言的合并一致性
 */
function resolveRootTypeId(title: string): string | null {
    if (ROOT_FOLDER_NAMES.TOOLBAR.includes(title)) return ROOT_TYPE_IDS.TOOLBAR;
    if (ROOT_FOLDER_NAMES.MENU.includes(title)) return ROOT_TYPE_IDS.MENU;
    if (ROOT_FOLDER_NAMES.UNFILED.includes(title)) return ROOT_TYPE_IDS.UNFILED;
    if (ROOT_FOLDER_NAMES.MOBILE.includes(title)) return ROOT_TYPE_IDS.MOBILE;
    return null;
}

/** 判断节点是否为浏览器的结构性根文件夹（不可删除/移动） */
export function isStructuralRootId(browserId: string | undefined): boolean {
    if (!browserId) return false;
    return ROOT_NODE_IDS.TOOLBAR.includes(browserId) ||
           ROOT_NODE_IDS.UNFILED.includes(browserId) ||
           ROOT_NODE_IDS.MOBILE.includes(browserId) ||
           ROOT_NODE_IDS.MENU.includes(browserId);
}

/**
 * 生成稳定的书签 ID
 *
 * 对于书签：基于 URL + 父路径生成 ID（P0-1：掺入父路径使重复 URL 的
 * 多份书签各自拥有独立 ID，不再互相覆盖或被同一墓碑误杀）
 * 对于文件夹：基于标题和父路径生成 ID
 *
 * @param bookmark - 书签对象
 * @param parentPath - 父路径（用于书签/文件夹 ID 生成，见 buildChildPath 的路径约定）
 * @param duplicateIndex - 同级同 URL（书签）/同名（文件夹）兄弟中的序号
 *   （P0-1：区分同一文件夹内的重复项；0 表示第一个，ID 与无序号时相同）
 * @returns 稳定的 ID 字符串
 */
export function generateStableId(bookmark: BookmarkInfo, parentPath: string = '', duplicateIndex: number = 0): string {
    if (bookmark.url) {
        // 书签：用 URL + 父路径生成稳定 ID（顶层书签 parentPath 为空串，退化为纯 URL ID）
        const base = parentPath ? `${parentPath}|${bookmark.url}` : bookmark.url;
        const hash = hashString(duplicateIndex > 0 ? `${base}#${duplicateIndex}` : base);
        return `bm_${hash}`;
    }

    if (parentPath === '') {
        // 顶层节点：优先使用类型化 ID，保证跨语言/跨设备一致
        const rootTypeId = resolveRootTypeId(bookmark.title);
        if (rootTypeId) return rootTypeId;
        // 空标题顶层文件夹 = 旧版数据的合成根节点
        if (!bookmark.title) return SYNTHETIC_ROOT_ID;
    }

    // 文件夹：用标题 + 父路径生成稳定 ID（同级同名文件夹用序号区分）
    const path = parentPath ? `${parentPath}/${bookmark.title}` : bookmark.title;
    const hash = hashString(duplicateIndex > 0 ? `${path}#${duplicateIndex}` : path);
    return `folder_${hash}`;
}

/**
 * 计算节点在同级中的重复序号（duplicateIndex）
 *
 * 规则：统计位于 index 之前、与目标节点同 URL（书签）或同名（文件夹）的兄弟数量。
 * 该规则必须与 normalizeBookmarkIds / writeback.collectLocalRefs 的遍历计数保持一致——
 * background 计算删除墓碑时节点已不在树中，只能按位置反查，故独立成函数供其调用。
 *
 * @param siblings - 目标节点父级的 children 数组；删除场景传删除后的数组，
 *   位置在 index 之前的兄弟不受删除影响，计数仍然正确
 * @param index - 目标节点在父级 children 中的下标（删除场景传 removeInfo.index）
 * @param target - 目标节点（删除场景取 removeInfo.node，其已不在 siblings 中）
 */
export function duplicateIndexOf(siblings: BookmarkInfo[], index: number, target: BookmarkInfo): number {
    if (index <= 0 || siblings.length === 0) return 0;
    let count = 0;
    const stop = Math.min(index, siblings.length);
    for (let i = 0; i < stop; i++) {
        const sibling = siblings[i];
        if (target.url) {
            if (sibling.url === target.url) count++;
        } else if (!sibling.url && sibling.title === target.title) {
            count++;
        }
    }
    return count;
}

/**
 * 旧版（纯 URL）书签稳定 ID
 *
 * 仅用于 P0-1 升级过渡：旧版本生成的墓碑只记录纯 URL ID，升级后 30 天 TTL 内
 * 按"同 URL 即同书签"的旧语义继续匹配，防止已删除书签复活一次；TTL 过后自然消失。
 */
export function legacyBookmarkId(url: string): string {
    return `bm_${hashString(url)}`;
}

/**
 * 计算节点的子树路径前缀（parentPath 约定的唯一实现，三处消费方必须一致：
 * normalizeBookmarkIds / writeback.collectLocalRefs / background.findNodePath）
 *
 * 顶层节点的子树使用类型化根 ID（root_toolbar 等）而非本地化标题，
 * 保证"书签栏"与"Bookmarks Bar"下的同名书签/文件夹跨语言、跨设备 ID 一致。
 */
export function buildChildPath(parentPath: string, nodeTitle: string): string {
    if (parentPath) {
        return `${parentPath}/${nodeTitle}`;
    }
    return resolveRootTypeId(nodeTitle) ?? nodeTitle;
}

/**
 * 归一化书签树的顶层形状
 *
 * 历史数据存在三种顶层形态：
 * 1. 浏览器 getTree() 的完整树（单个虚拟根节点，id 为 '0'/'root________'）
 * 2. 旧版自动同步上传的数据（单个合成根节点 folder_0，title 为空串）
 * 3. 标准的剥根格式（顶层为书签栏/其他书签等实际根文件夹）
 *
 * 本函数将形态 1/2 统一展开为形态 3。
 */
export function normalizeTreeShape(tree: BookmarkInfo[]): BookmarkInfo[] {
    if (
        tree.length === 1 &&
        !tree[0].url &&
        Array.isArray(tree[0].children) &&
        (ROOT_NODE_IDS.ROOT.includes(tree[0].id || '') || tree[0].id === SYNTHETIC_ROOT_ID)
    ) {
        return tree[0].children;
    }
    return tree;
}

/**
 * 从树中剔除已被墓碑标记的节点（含整个子树）
 * 用于手动上传前过滤，防止已被其他设备删除的书签"复活"
 *
 * P0-1 升级过渡：旧版本墓碑只记录纯 URL ID（legacyBookmarkId），
 * 30 天 TTL 内按旧语义继续匹配同 URL 书签，之后随过期自然消失。
 *
 * @param tree - 已标准化的书签树
 * @param tombstoneIds - 墓碑 ID 集合
 * @returns 过滤后的新书签树
 */
export function filterTombstonedNodes(tree: BookmarkInfo[], tombstoneIds: Set<string>): BookmarkInfo[] {
    const result: BookmarkInfo[] = [];
    for (const node of tree) {
        if (node.id && tombstoneIds.has(node.id)) {
            continue;
        }
        if (node.url && tombstoneIds.has(legacyBookmarkId(node.url))) {
            continue;
        }
        if (node.children) {
            node.children = filterTombstonedNodes(node.children, tombstoneIds);
        }
        result.push(node);
    }
    return result;
}

/**
 * 标准化书签树的 ID
 * 递归处理整个书签树，为每个节点生成稳定的 ID
 * 同时更新 parentId 引用
 * 
 * @param bookmarks - 书签数组
 * @param parentPath - 父文件夹路径（用于文件夹 ID 生成）
 * @param parentId - 父文件夹的新 ID
 * @returns 标准化后的书签数组（原地修改）
 */
export function normalizeBookmarkIds(
    bookmarks: BookmarkInfo[],
    parentPath: string = '',
    parentId?: string
): BookmarkInfo[] {
    // P0-1: 同级同 URL（书签）/同名（文件夹）兄弟按出现顺序编号，
    // 使同一文件夹内的重复项各自拥有独立 ID（与 duplicateIndexOf 的规则一致）
    const urlSeen = new Map<string, number>();
    const titleSeen = new Map<string, number>();
    for (const bookmark of bookmarks) {
        let duplicateIndex: number;
        if (bookmark.url) {
            duplicateIndex = urlSeen.get(bookmark.url) ?? 0;
            urlSeen.set(bookmark.url, duplicateIndex + 1);
        } else {
            duplicateIndex = titleSeen.get(bookmark.title) ?? 0;
            titleSeen.set(bookmark.title, duplicateIndex + 1);
        }

        // 生成稳定 ID
        const newId = generateStableId(bookmark, parentPath, duplicateIndex);
        bookmark.id = newId;

        // 关键修复：始终更新 parentId
        // 如果传入了 parentId 参数，使用它
        // 否则清除 parentId（表示这是根级书签）
        if (parentId !== undefined) {
            bookmark.parentId = parentId;
        } else {
            // 根级书签不应该有 parentId
            bookmark.parentId = undefined;
        }

        // 递归处理子节点
        if (bookmark.children && bookmark.children.length > 0) {
            const childPath = buildChildPath(parentPath, bookmark.title);
            normalizeBookmarkIds(bookmark.children, childPath, newId);
        }
    }
    return bookmarks;
}

/**
 * 递归计算书签数量
 * 统计所有有效书签（有URL的节点）的数量
 * 
 * @param bookmarkList - 书签数组或 undefined
 * @returns number 书签总数
 * 
 * @example
 * const bookmarks = await browser.bookmarks.getTree();
 * const count = getBookmarkCount(bookmarks);
 * console.log(`共有 ${count} 个书签`);
 */
export function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined): number {
    let count = 0;
    if (bookmarkList) {
        bookmarkList.forEach(c => {
            if (c.url) {
                count++;
            } else {
                count += getBookmarkCount(c.children);
            }
        });
    }
    return count;
}

/**
 * 格式化书签树
 * 提取书签树的 children 部分，即根文件夹下的内容
 * 
 * @param bookmarks - 完整的书签树
 * @returns BookmarkInfo[] | undefined 格式化后的书签数组
 * 
 * 注意：浏览器返回的 bookmarkTree[0] 是虚拟根节点
 * 实际的书签存储在 its children 中
 * 
 * @example
 * const bookmarkTree = await browser.bookmarks.getTree();
 * const bookmarks = formatBookmarks(bookmarkTree);
 */
export function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    if (bookmarks[0]?.children) {
        return bookmarks[0].children;
    }
    return undefined;
}

/**
 * 扁平化书签树为数组
 * 将嵌套的书签树结构转换为扁平的数组
 * 只保留有 URL 的书签（不包含文件夹）
 * 
 * @param bookmarks - 书签树数组
 * @returns BookmarkInfo[] 扁平化的书签数组
 * 
 * @example
 * const bookmarkTree = await browser.bookmarks.getTree();
 * const flatList = flattenBookmarks(bookmarkTree);
 * // flatList 现在是一个包含所有书签的数组
 */
export function flattenBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] {
    const result: BookmarkInfo[] = [];
    for (const b of bookmarks) {
        if (b.url) {
            result.push({ title: b.title, url: b.url });
        }
        if (b.children) {
            result.push(...flattenBookmarks(b.children));
        }
    }
    return result;
}
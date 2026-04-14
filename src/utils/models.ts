/**
 * BookmarkHub 数据模型定义
 * 
 * 本文件定义了扩展程序中使用的所有数据类型接口，包括：
 * - 书签信息 (BookmarkInfo)
 * - 同步数据 (SyncDataInfo)
 * - 浏览器类型枚举 (BrowserType)
 * - 操作类型枚举 (OperType)
 * - 根书签文件夹类型 (RootBookmarksType)
 * - 同步记录 (SyncRecord)
 * - 同步结果 (SyncResult)
 * - 冲突信息 (ConflictInfo)
 */

/**
 * 书签信息类
 * 对应浏览器 bookmarks API 中的 BookmarkTreeNode
 * 用于存储单个书签或文件夹的完整信息
 */
export class BookmarkInfo {
    /** 书签唯一标识符 */
    id?: string;
    /** 父文件夹ID */
    parentId?: string | undefined;
    /** 在父文件夹中的索引位置 */
    index?: number | undefined;
    /** 书签URL地址 (仅书签类型有效) */
    url?: string | undefined;
    /** 书签标题 */
    title: string = "";
    /** 创建时间戳 (毫秒) */
    dateAdded?: number | undefined;
    /** 最后修改时间戳 (毫秒) */
    dateGroupModified?: number | undefined;
    /** 是否为系统管理书签 */
    unmodifiable?: "managed" | undefined;
    /** 节点类型: bookmark(书签) / folder(文件夹) / separator(分隔线) */
    type?: "bookmark" | "folder" | "separator" | undefined;
    /** 子书签/子文件夹列表 (仅文件夹类型有效) */
    children?: BookmarkInfo[] | undefined;

    public constructor(title: string, url?: string, children?: BookmarkInfo[]) {
        this.title = title;
        this.url = url;
        this.children = children;
    }

    // P1-18: Safe URL protocols for bookmarks
    private static readonly SAFE_PROTOCOLS = ['http:', 'https:', 'ftp:', 'ftps:', 'chrome:', 'about:', 'edge:'];

    // P1-18: Validate bookmark data
    static validate(data: Partial<BookmarkInfo>): boolean {
        if (!data.title || typeof data.title !== 'string') return false;
        if (data.url !== undefined && data.url !== null && typeof data.url !== 'string') return false;
        if (data.children !== undefined && !Array.isArray(data.children)) return false;
        if (data.url && data.url.trim()) {
            try {
                const parsed = new URL(data.url);
                if (!BookmarkInfo.SAFE_PROTOCOLS.includes(parsed.protocol)) return false;
            } catch {
                return false;
            }
        }
        return true;
    }

    // P1-18: Create BookmarkInfo with validation, returns null if invalid
    static createSafe(data: Partial<BookmarkInfo>): BookmarkInfo | null {
        if (!BookmarkInfo.validate(data)) return null;
        const bookmark = new BookmarkInfo(
            data.title || '',
            data.url,
            data.children
        );
        if (data.id) bookmark.id = data.id;
        if (data.parentId) bookmark.parentId = data.parentId;
        if (data.index !== undefined) bookmark.index = data.index;
        if (data.dateAdded) bookmark.dateAdded = data.dateAdded;
        if (data.dateGroupModified) bookmark.dateGroupModified = data.dateGroupModified;
        if (data.unmodifiable) bookmark.unmodifiable = data.unmodifiable;
        if (data.type) bookmark.type = data.type;
        return bookmark;
    }
}

/**
 * 同步数据结构
 * 用于存储完整的书签同步数据，包含元信息
 * 序列化后存储到 GitHub Gist 或 WebDAV 服务器
 * 
 * @deprecated Use SyncData interface instead (v2.0 format)
 * This format will be removed in a future version.
 */
export class SyncDataInfo {
    /** 浏览器类型标识 (存储浏览器User-Agent) */
    browser: string = "chrome";
    /** 扩展程序版本号 */
    version: string = "1.0.0";
    /** 同步数据创建时间戳 (毫秒) */
    createDate: number = Date.now();
    /** 书签数据数组 */
    bookmarks: BookmarkInfo[] | undefined = [];
}

/**
 * 浏览器类型枚举
 * 用于区分不同浏览器以便进行兼容性处理
 */
export enum BrowserType { 
    /** Firefox 浏览器 */
    FIREFOX, 
    /** Chrome/Chromium 内核浏览器 */
    CHROME, 
    /** Microsoft Edge 浏览器 */
    EDGE 
}

/**
 * 操作类型枚举
 * 用于标识当前正在执行的操作类型
 * 以避免操作过程中的事件监听触发不必要的逻辑
 * 
 * 在同步流程中的作用:
 * - NONE: 初始状态，无特殊操作
 * - SYNC: 同步操作进行中，抑制书签事件触发
 * - CHANGE/MOVE/CREATE/REMOVE: 标记特定书签操作，用于细粒度的事件处理
 */
export enum OperType { 
    /** 无操作 - 默认状态 */
    NONE, 
    /** 同步操作 - 批量同步书签时设置，防止事件递归触发 */
    SYNC, 
    /** 书签变更 - 书签属性修改时触发 */
    CHANGE, 
    /** 书签创建 - 新书签/文件夹创建时触发 */
    CREATE, 
    /** 书签移动 - 书签位置变更时触发 */
    MOVE, 
    /** 书签删除 - 书签/文件夹删除时触发 */
    REMOVE 
}

/**
 * 根书签文件夹类型枚举
 * 定义浏览器中不同类型的根文件夹
 * 用于在同步时识别和转换不同浏览器的文件夹结构
 */
export enum RootBookmarksType { 
    /** 书签菜单文件夹 */
    MenuFolder = "MenuFolder", 
    /** 书签工具栏文件夹 */
    ToolbarFolder = "ToolbarFolder", 
    /** 其他书签文件夹 */
    UnfiledFolder = "UnfiledFolder", 
    /** 移动设备书签文件夹 */
    MobileFolder = "MobileFolder" 
}

/**
 * 同步记录接口
 */
export const rootBookmarks: BookmarkInfo[] = [
    {
        // Firefox: menu________ / Chrome: 0
        "id": "menu________",
        "parentId": "0",
        "title": RootBookmarksType.MenuFolder,
        children: []
    }, {
        // Firefox: toolbar_____ / Chrome: 1
        "id": "toolbar_____",
        "parentId": "0",
        "title": RootBookmarksType.ToolbarFolder,
        children: []
    }, {
        // Firefox: unfiled_____ / Chrome: 2
        "id": "unfiled_____",
        "parentId": "0",
        "title": RootBookmarksType.UnfiledFolder,
        children: []
    }, {
        // Firefox: mobile______ / Chrome: 3
        "id": "mobile______",
        "parentId": "0",
        "title": RootBookmarksType.MobileFolder,
        children: []
    }
];

/**
 * 同步方向类型
 */
export type SyncDirection = 'upload' | 'download';

/**
 * 同步状态类型
 */
export type SyncStatus = 'success' | 'failed' | 'skipped';

/**
 * 同步结果接口
 * 表示一次同步操作的完整结果
 * 包含同步统计信息和状态
 */
export interface SyncResult {
    /** 同步方向 */
    direction: SyncDirection;
    /** 同步状态 */
    status: SyncStatus;
    /** 同步执行时间戳 */
    timestamp: number;
    /** 本地书签数量 */
    localCount: number;
    /** 远程书签数量 */
    remoteCount: number;
    /** 冲突数量 (可选) */
    conflictCount?: number;
    /** 错误信息 (可选) */
    errorMessage?: string;
}

/**
 * 冲突信息接口
 * 表示同步过程中检测到的书签冲突
 * 用于智能合并和冲突解决
 */
export interface ConflictInfo {
    /** 冲突类型: local(本地新增) / remote(远程新增) / modified(双方修改) */
    type: 'local' | 'remote' | 'modified';
    /** 本地书签信息 (可选) */
    localBookmark?: BookmarkInfo;
    /** 远程书签信息 (可选) */
    remoteBookmark?: BookmarkInfo;
}

/**
 * 浏览器信息接口
 * 用于标识使用数据来源的浏览器和操作系统
 */
export interface BrowserInfo {
    /** 浏览器名称 (e.g. Chrome, Firefox, Edge) */
    browser: string;
    /** 操作系统 (e.g. Windows, macOS, Linux) */
    os: string;
}

/**
 * 备份记录接口
 * 表示一次书签备份的历史记录
 */
export interface BackupRecord {
    /** 备份时间戳 */
    backupTimestamp: number;
    /** 快照时间的备份书签数据 */
    bookmarkData: BookmarkInfo[];
    /** 备份的书签数量 */
    bookmarkCount: number;
}

/**
 * 墓碑记录接口
 * 用于记录已删除的书签，支持分布式同步中的删除传播
 *
 * 墓碑机制用于解决删除传播问题：
 * - 当设备 A 删除书签后，需要通知设备 B
 * - 设备 B 可能还没同步，本地还有该书签
 * - 墓碑记录哪些书签被删除了，防止"复活"
 */
export interface Tombstone {
    /** 被删除书签的稳定 ID（浏览器书签 ID） */
    id: string;
    /** 删除时间戳（毫秒） */
    deletedAt: number;
    /** 删除设备标识（浏览器 + OS） */
    deletedBy: string;
}

/**
 * 同步数据接口 (新格式)
 * 用于存储带有历史记录的同步数据
 * 替代原有的 SyncDataInfo 类
 */
export interface SyncData {
    /** 数据格式版本 (e.g. "2.0") */
    version: string;
    /** 最后同步时间戳 */
    lastSyncTimestamp: number;
    /** 上次同步的源浏览器信息 */
    sourceBrowser: BrowserInfo;
    /** 备份记录数组（按时间倒序排列，最新在第一位） */
    backupRecords: BackupRecord[];
    /** 墓碑记录数组（记录已删除的书签，用于删除传播） */
    tombstones?: Tombstone[];
}

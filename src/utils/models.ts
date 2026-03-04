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
    id?: string | undefined = "";
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

    /**
     * 构造函数
     * @param title - 书签标题
     * @param url - 书签URL (可选)
     * @param children - 子节点数组 (可选)
     */
    public constructor(title: string, url?: string, children?: BookmarkInfo[]) {
        this.title = title;
        this.url = url;
        this.children = children;
    }
}

/**
 * 同步数据结构
 * 用于存储完整的书签同步数据，包含元信息
 * 序列化后存储到 GitHub Gist 或 WebDAV 服务器
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
 */
export enum OperType { 
    /** 无操作 */
    NONE, 
    /** 同步操作 */
    SYNC, 
    /** 书签变更 */
    CHANGE, 
    /** 书签创建 */
    CREATE, 
    /** 书签移动 */
    MOVE, 
    /** 书签删除 */
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
 * 根书签文件夹列表
 * 定义了浏览器的四个主要书签根文件夹
 * 每个浏览器对这些文件夹有不同的ID命名规则
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
 * 同步记录接口
 * 用于记录每次同步操作的详细信息
 * 存储在浏览器本地存储中
 */
export interface SyncRecord {
    /** 上次同步时间戳 (毫秒) */
    lastSyncTime: number;
    /** 上次同步方向: upload(上传) / download(下载) */
    lastSyncDirection: 'upload' | 'download';
    /** 上次同步状态: success(成功) / failed(失败) */
    lastSyncStatus: 'success' | 'failed';
    /** 错误信息 (可选) */
    errorMessage?: string;
}

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

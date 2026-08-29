import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom/client';
import { Dropdown, Badge, Spinner } from 'react-bootstrap';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting,
    AiOutlineExport, AiOutlineImport,
    AiOutlineFork
} from 'react-icons/ai'
import { exportBookmarks } from '../../utils/exporter'
import { importBookmarks } from '../../utils/importer'
import { flattenBookmarks } from '../../utils/bookmarkUtils'
import { MESSAGE_NAMES, STORAGE_KEYS, ROOT_NODE_IDS } from '../../utils/constants'
import { detectBookmarkBrowserType, resolveRootTargetBrowserId } from '../../utils/browserInfo'
import iconLogo from '../../assets/icon.png'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'

/** 上次同步信息（与 sync.ts saveSyncStatus 写入的键对应） */
interface LastSyncInfo {
    timestamp: number;
    status: string;
    error: string;
    conflicts: number;
}

const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0" })
    const [busyAction, setBusyAction] = useState<string | null>(null)
    const [lastSync, setLastSync] = useState<LastSyncInfo | null>(null)

    const refreshCounts = useCallback(async () => {
        const data = await browser.storage.local.get([STORAGE_KEYS.LOCAL_COUNT, STORAGE_KEYS.REMOTE_COUNT]);
        setCount({
            local: String(data[STORAGE_KEYS.LOCAL_COUNT] || 0),
            remote: String(data[STORAGE_KEYS.REMOTE_COUNT] || 0)
        });
    }, []);

    const refreshLastSync = useCallback(async () => {
        const data = await browser.storage.local.get([
            STORAGE_KEYS.LAST_SYNC_TIME, STORAGE_KEYS.LAST_SYNC_STATUS, STORAGE_KEYS.LAST_SYNC_ERROR,
            STORAGE_KEYS.LAST_SYNC_CONFLICTS,
        ]);
        const timestamp = Number(data[STORAGE_KEYS.LAST_SYNC_TIME] || 0);
        setLastSync(timestamp > 0 ? {
            timestamp,
            status: String(data[STORAGE_KEYS.LAST_SYNC_STATUS] || ''),
            error: String(data[STORAGE_KEYS.LAST_SYNC_ERROR] || ''),
            conflicts: Number(data[STORAGE_KEYS.LAST_SYNC_CONFLICTS] || 0),
        } : null);
    }, []);

    useEffect(() => {
        refreshCounts();
        refreshLastSync();

        // 监听同步完成消息，刷新数量与上次同步状态
        const handleMessage = (message: { name: string }) => {
            if (message.name === MESSAGE_NAMES.REFRESH_COUNTS) {
                refreshCounts();
                refreshLastSync();
            }
        };
        browser.runtime.onMessage.addListener(handleMessage);

        return () => {
            browser.runtime.onMessage.removeListener(handleMessage);
        };
    }, [refreshCounts, refreshLastSync])

    /**
     * 发起同步/上传/下载操作
     * 解析 background 的响应并把结果显示在 footer（此前响应被完全忽略，P0-5/P2-9）
     */
    const handleAction = async (action: string) => {
        if (busyAction) return;
        // 破坏性操作需确认（P2-10）
        if (action === MESSAGE_NAMES.DOWNLOAD) {
            const confirmed = window.confirm(browser.i18n.getMessage('confirmDownload') || 'Continue?');
            if (!confirmed) return;
        }
        setBusyAction(action);
        try {
            const result = await browser.runtime.sendMessage({ name: action });
            await refreshCounts();
            await refreshLastSync();
            if (result && result.status === 'skipped') {
                window.alert(browser.i18n.getMessage('syncSkipped') || 'Sync skipped');
            } else if (result && result.error) {
                window.alert(`${browser.i18n.getMessage('syncFailedLabel') || 'Sync failed'}: ${result.error}`);
            }
        } catch (error) {
            window.alert(`${browser.i18n.getMessage('syncFailedLabel') || 'Sync failed'}: ${(error as Error).message}`);
        } finally {
            setBusyAction(null);
        }
    };

    const handleSetting = async () => {
        await handleAction(MESSAGE_NAMES.SETTING);
    };

    const handleExport = async () => {
        const bookmarks = await browser.bookmarks.getTree();
        const flatBookmarks = flattenBookmarks(bookmarks);
        await exportBookmarks('html', flatBookmarks);
    };

    /**
     * 递归导入：保留文件夹层级，同一父文件夹下按 URL 去重（P1-8）
     * 此前导入把所有书签拍平到根目录且不查重
     */
    const createTreeRecursively = async (nodes: { title: string; url?: string; children?: unknown[] }[], parentId: string): Promise<number> => {
        let created = 0;
        const siblings = await browser.bookmarks.getChildren(parentId);
        const existingUrls = new Set(siblings.filter(c => c.url).map(c => c.url as string));
        for (const node of nodes) {
            if (node.url) {
                if (existingUrls.has(node.url)) continue; // 去重
                await browser.bookmarks.create({ parentId, title: node.title, url: node.url });
                existingUrls.add(node.url);
                created++;
            } else {
                const folder = await browser.bookmarks.create({ parentId, title: node.title });
                created += await createTreeRecursively((node.children as never[]) || [], folder.id);
            }
        }
        return created;
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const bookmarks = await importBookmarks(file);
                // 导入目标：其他书签（不污染书签栏）
                const browserType = await detectBookmarkBrowserType();
                const targetRoot = resolveRootTargetBrowserId({ title: '' }, browserType) || ROOT_NODE_IDS.UNFILED[0];
                const created = await createTreeRecursively(bookmarks, targetRoot);
                await browser.notifications.create({
                    type: 'basic',
                    iconUrl: iconLogo,
                    title: browser.i18n.getMessage('importBookmarks') || 'Import Bookmarks',
                    message: browser.i18n.getMessage('importSuccess', [String(created)]) || `Successfully imported ${created} bookmarks`
                });
            } catch (error) {
                await browser.notifications.create({
                    type: 'basic',
                    iconUrl: iconLogo,
                    title: browser.i18n.getMessage('error') || 'Error',
                    message: browser.i18n.getMessage('importFailed', [(error as Error).message]) || `Import failed: ${(error as Error).message}`
                });
            } finally {
                e.target.value = ''; // 允许重复导入同一文件
            }
        }
    };

    /** footer 状态行：忙 → 同步中；否则显示上次同步信息 */
    const footerStatus = (): string => {
        if (busyAction) return browser.i18n.getMessage('syncRunning') || 'Syncing…';
        if (!lastSync) return '';
        const time = new Date(lastSync.timestamp).toLocaleString();
        const label = browser.i18n.getMessage('lastSyncLabel') || 'Last sync';
        if (lastSync.status === 'success') {
            const conflicts = lastSync.conflicts > 0
                ? ` (${lastSync.conflicts} ${browser.i18n.getMessage('syncConflicts') || 'conflicts resolved'})`
                : '';
            return `${label}: ${time}${conflicts}`;
        }
        if (lastSync.status === 'failed') return `${label}: ${browser.i18n.getMessage('syncFailedLabel') || 'Sync failed'} (${time})`;
        return `${label}: ${time}`;
    };

    const actionButtonProps = (action: string) => ({
        disabled: busyAction !== null,
        onClick: () => handleAction(action),
        'aria-busy': busyAction === action,
    });

    return (
        <IconContext.Provider value={{ className: 'dropdown-item-icon' }}>
            <Dropdown.Menu show>
                <Dropdown.Item name={MESSAGE_NAMES.SYNC} as="button" {...actionButtonProps(MESSAGE_NAMES.SYNC)} aria-label={browser.i18n.getMessage('syncNow')} title={browser.i18n.getMessage('syncNowDesc')}>
                    <AiOutlineFork aria-hidden="true" />{browser.i18n.getMessage('syncNow')}
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item name={MESSAGE_NAMES.UPLOAD} as="button" {...actionButtonProps(MESSAGE_NAMES.UPLOAD)} aria-label={browser.i18n.getMessage('uploadBookmarks')} title={browser.i18n.getMessage('uploadBookmarksDesc')}><AiOutlineCloudUpload aria-hidden="true" />{browser.i18n.getMessage('uploadBookmarks')}</Dropdown.Item>
                <Dropdown.Item name={MESSAGE_NAMES.DOWNLOAD} as="button" {...actionButtonProps(MESSAGE_NAMES.DOWNLOAD)} aria-label={browser.i18n.getMessage('downloadBookmarks')} title={browser.i18n.getMessage('downloadBookmarksDesc')}><AiOutlineCloudDownload aria-hidden="true" />{browser.i18n.getMessage('downloadBookmarks')}</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item as="button" onClick={handleExport} aria-label={browser.i18n.getMessage('exportBookmarks')}>
                    <AiOutlineExport aria-hidden="true" /> {browser.i18n.getMessage('exportBookmarks')}
                </Dropdown.Item>
                <Dropdown.Item as="label" className="dropdown-item mb-0" aria-label={browser.i18n.getMessage('importBookmarks')} role="button">
                    <AiOutlineImport aria-hidden="true" /> {browser.i18n.getMessage('importBookmarks')}
                    <input
                        type="file"
                        accept=".json,.html"
                        style={{ display: 'none' }}
                        onChange={handleImport}
                        aria-label={browser.i18n.getMessage('importBookmarks')}
                    />
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item as="button" onClick={handleSetting} aria-label={browser.i18n.getMessage('settings')}><AiOutlineSetting aria-hidden="true" />{browser.i18n.getMessage('settings')}</Dropdown.Item>
                <div className="footer-bar" aria-live="polite" aria-atomic="true">
                    {busyAction && <Spinner size="sm" animation="border" role="status" className="mr-2" aria-hidden="true" />}
                    <span className="count-info">
                        <Badge id="localCount" variant="light" title={browser.i18n.getMessage('localCount')}>
                          {browser.i18n.getMessage('local')}: {count["local"]}
                        </Badge>
                        <span className="count-separator" style={{ margin: '0 8px' }}>/</span>
                        <Badge id="remoteCount" variant="light" title={browser.i18n.getMessage('remoteCount')}>
                          {browser.i18n.getMessage('remote')}: {count["remote"]}
                        </Badge>
                    </span>
                    <div className="last-sync-info" style={{ fontSize: '0.75rem', opacity: 0.85 }}>{footerStatus()}</div>
                </div>
            </Dropdown.Menu >
        </IconContext.Provider>
    )
}


ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
);

import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { Dropdown, Badge } from 'react-bootstrap';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting,
    AiOutlineExport, AiOutlineImport
} from 'react-icons/ai'
import { exportBookmarks } from '../../utils/exporter'
import { importBookmarks } from '../../utils/importer'
import { flattenBookmarks } from '../../utils/bookmarkUtils'
import { MESSAGE_NAMES, STORAGE_KEYS } from '../../utils/constants'
import iconLogo from '../../assets/icon.png'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'

/** 允许发送给 background 的操作白名单（P3 消息协议常量化） */
const ALLOWED_ACTIONS: ReadonlySet<string> = new Set<string>([
    MESSAGE_NAMES.UPLOAD,
    MESSAGE_NAMES.DOWNLOAD,
    MESSAGE_NAMES.SETTING,
]);

const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0" })

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const elem = e.target as HTMLElement;
            // 只禁用有 name 属性的 dropdown-item（同步操作），不影响 Export/Import/Settings
            if (elem != null && elem.classList.contains('dropdown-item') && elem.getAttribute('name')) {
                const action = elem.getAttribute('name') as string;
                if (!ALLOWED_ACTIONS.has(action)) return;
                elem.setAttribute('disabled', 'disabled');
                browser.runtime.sendMessage({ name: action })
                    .then(() => {
                        elem.removeAttribute('disabled');
                    })
                    .catch(() => {
                        elem.removeAttribute('disabled');
                    });
            }
        };
        document.addEventListener('click', handleClick);

        return () => {
            document.removeEventListener('click', handleClick);
        };
    }, [])

    useEffect(() => {
        const getSetting = async () => {
            let data = await browser.storage.local.get([STORAGE_KEYS.LOCAL_COUNT, STORAGE_KEYS.REMOTE_COUNT]);
            setCount({
                local: String(data[STORAGE_KEYS.LOCAL_COUNT] || 0),
                remote: String(data[STORAGE_KEYS.REMOTE_COUNT] || 0)
            });
        }
        getSetting();

        // 监听同步完成消息，刷新数量显示
        const handleMessage = (message: { name: string }) => {
            if (message.name === MESSAGE_NAMES.REFRESH_COUNTS) {
                getSetting();
            }
        };
        browser.runtime.onMessage.addListener(handleMessage);

        return () => {
            browser.runtime.onMessage.removeListener(handleMessage);
        };
    }, [])
    
    const handleExport = async () => {
        const bookmarks = await browser.bookmarks.getTree();
        const flatBookmarks = flattenBookmarks(bookmarks);
        await exportBookmarks('html', flatBookmarks);
    };
    
const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const bookmarks = await importBookmarks(file);
                for (const bookmark of bookmarks) {
                    await browser.bookmarks.create({
                        title: bookmark.title,
                        url: bookmark.url
                    });
                }
                // P1-11: Replace alert() with browser.notifications to prevent XSS
                await browser.notifications.create({
                    type: 'basic',
                    iconUrl: iconLogo,
                    title: browser.i18n.getMessage('importBookmarks') || 'Import Bookmarks',
                    message: browser.i18n.getMessage('importSuccess', [String(bookmarks.length)]) || `Successfully imported ${bookmarks.length} bookmarks`
                });
            } catch (error) {
                // P1-11: Replace alert() with browser.notifications
                await browser.notifications.create({
                    type: 'basic',
                    iconUrl: iconLogo,
                    title: browser.i18n.getMessage('error') || 'Error',
                    message: browser.i18n.getMessage('importFailed', [(error as Error).message]) || `Import failed: ${(error as Error).message}`
                });
            }
        }
    };
    
    return (
        <IconContext.Provider value={{ className: 'dropdown-item-icon' }}>
            <Dropdown.Menu show>
                <Dropdown.Item name='upload' as="button" aria-label={browser.i18n.getMessage('uploadBookmarks')} title={browser.i18n.getMessage('uploadBookmarksDesc')}><AiOutlineCloudUpload aria-hidden="true" />{browser.i18n.getMessage('uploadBookmarks')}</Dropdown.Item>
                <Dropdown.Item name='download' as="button" aria-label={browser.i18n.getMessage('downloadBookmarks')} title={browser.i18n.getMessage('downloadBookmarksDesc')}><AiOutlineCloudDownload aria-hidden="true" />{browser.i18n.getMessage('downloadBookmarks')}</Dropdown.Item>
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
                <Dropdown.Item name='setting' as="button" aria-label={browser.i18n.getMessage('settings')}><AiOutlineSetting aria-hidden="true" />{browser.i18n.getMessage('settings')}</Dropdown.Item>
<div className="footer-bar" aria-live="polite" aria-atomic="true">
                    <span className="count-info">
                        <Badge id="localCount" variant="light" title={browser.i18n.getMessage('localCount')}>
                          {browser.i18n.getMessage('local')}: {count["local"]}
                        </Badge>
                        <span className="count-separator" style={{ margin: '0 8px' }}>/</span>
                        <Badge id="remoteCount" variant="light" title={browser.i18n.getMessage('remoteCount')}>
                          {browser.i18n.getMessage('remote')}: {count["remote"]}
                        </Badge>
                    </span>
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



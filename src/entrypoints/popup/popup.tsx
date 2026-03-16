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
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'

const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0" })
    
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            let elem = e.target as HTMLInputElement;
            if (elem != null && elem.className === 'dropdown-item') {
                elem.setAttribute('disabled', 'disabled');
                browser.runtime.sendMessage({ name: elem.name })
                    .then(() => {
                        elem.removeAttribute('disabled');
                    })
                    .catch(() => {});
            }
        };
        document.addEventListener('click', handleClick);
        
        return () => {
            document.removeEventListener('click', handleClick);
        };
    }, [])
    
    useEffect(() => {
        const getSetting = async () => {
            let data = await browser.storage.local.get(["localCount", "remoteCount"]);
            setCount({ 
                local: String(data["localCount"] || 0), 
                remote: String(data["remoteCount"] || 0) 
            });
        }
        getSetting();
        
        // 监听同步完成消息，刷新数量显示
        const handleMessage = (message: { name: string }) => {
            if (message.name === 'refreshCounts') {
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
                alert(`Successfully imported ${bookmarks.length} bookmarks`);
            } catch (error) {
                alert('Failed to import bookmarks: ' + (error as Error).message);
            }
        }
    };
    
    return (
        <IconContext.Provider value={{ className: 'dropdown-item-icon' }}>
            <Dropdown.Menu show>
                <Dropdown.Item name='upload' as="button" title={browser.i18n.getMessage('uploadBookmarksDesc')}><AiOutlineCloudUpload />{browser.i18n.getMessage('uploadBookmarks')}</Dropdown.Item>
                <Dropdown.Item name='download' as="button" title={browser.i18n.getMessage('downloadBookmarksDesc')}><AiOutlineCloudDownload />{browser.i18n.getMessage('downloadBookmarks')}</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item as="button" onClick={handleExport}>
                    <AiOutlineExport /> {browser.i18n.getMessage('exportBookmarks')}
                </Dropdown.Item>
                <Dropdown.Item as="label" className="dropdown-item mb-0">
                    <AiOutlineImport /> {browser.i18n.getMessage('importBookmarks')}
                    <input
                        type="file"
                        accept=".json,.html"
                        style={{ display: 'none' }}
                        onChange={handleImport}
                    />
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item name='setting' as="button"><AiOutlineSetting />{browser.i18n.getMessage('settings')}</Dropdown.Item>
<div className="footer-bar">
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



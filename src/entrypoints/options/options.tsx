import React, { useState, useEffect, FormEvent } from 'react'
import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup, Card, Table, Modal } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage, { setEncrypted } from '../../utils/optionsStorage'
import { testWebDAVConnection } from '../../utils/webdav'
import { BackupRecord } from '../../utils/models'

const Options: React.FC = () => {
    const [githubToken, setGithubToken] = useState('');
    const [gistID, setGistID] = useState('');
    const [gistFileName, setGistFileName] = useState('BookmarkHub');
    const [enableNotify, setEnableNotify] = useState(true);
    const [enableAutoSync, setEnableAutoSync] = useState(false);
    const [enableIntervalSync, setEnableIntervalSync] = useState(false);
    const [syncInterval, setSyncInterval] = useState(60);
    const [enableEventSync, setEnableEventSync] = useState(true);
    const [conflictMode, setConflictMode] = useState<'auto' | 'prompt'>('auto');
    const [storageType, setStorageType] = useState<'github' | 'webdav'>('github');
    const [webdavUrl, setWebdavUrl] = useState('');
    const [webdavUsername, setWebdavUsername] = useState('');
    const [webdavPassword, setWebdavPassword] = useState('');
    const [webdavPath, setWebdavPath] = useState('/bookmarks.json');
    const [masterPassword, setMasterPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswordWarning, setShowPasswordWarning] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [backupRecords, setBackupRecords] = useState<BackupRecord[]>([]);
    const [showRestoreModal, setShowRestoreModal] = useState(false);
    const [selectedBackup, setSelectedBackup] = useState<BackupRecord | null>(null);
    const [restoreStatus, setRestoreStatus] = useState<'idle' | 'restoring' | 'success' | 'error'>('idle');
    
    const loadBackupRecords = async () => {
        const records = await browser.runtime.sendMessage({ name: 'getBackupRecords' });
        setBackupRecords(records || []);
    };
    
    const handleRestoreBackup = async (backup: BackupRecord) => {
        setSelectedBackup(backup);
        setShowRestoreModal(true);
    };
    
    const confirmRestore = async () => {
        if (!selectedBackup) return;
        setRestoreStatus('restoring');
        try {
            const result = await browser.runtime.sendMessage({ 
                name: 'restoreFromBackup', 
                timestamp: selectedBackup.backupTimestamp 
            });
            if (result.success) {
                setRestoreStatus('success');
                setTimeout(() => {
                    setShowRestoreModal(false);
                    setRestoreStatus('idle');
                }, 2000);
            } else {
                setRestoreStatus('error');
            }
        } catch {
            setRestoreStatus('error');
        }
    };
    
    const handleDeleteBackup = async (timestamp: number) => {
        if (confirm(browser.i18n.getMessage('confirmDeleteBackup') || 'Delete this backup?')) {
            await browser.runtime.sendMessage({ name: 'deleteBackupRecord', timestamp });
            loadBackupRecords();
        }
    };
    
    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };
    
    const validateSettings = (): string[] => {
        const errors: string[] = [];
        if (storageType === 'github') {
            if (!githubToken || githubToken.trim() === '') errors.push(browser.i18n.getMessage('githubTokenRequired'));
            if (!gistID || gistID.trim() === '') errors.push(browser.i18n.getMessage('gistIdRequired'));
        } else if (storageType === 'webdav') {
            if (!webdavUrl || webdavUrl.trim() === '') errors.push(browser.i18n.getMessage('webdavUrlRequired'));
            if (!webdavUsername || webdavUsername.trim() === '') errors.push(browser.i18n.getMessage('webdavUsernameRequired'));
            if (!webdavPassword || webdavPassword.trim() === '') errors.push(browser.i18n.getMessage('webdavPasswordRequired'));
        }
        return errors;
    };
    
    useEffect(() => {
        const loadSettings = async () => {
            const options = await optionsStorage.getAll();
            setGithubToken(options.githubToken as string || '');
            setGistID(options.gistID as string || '');
            setGistFileName(options.gistFileName as string || 'BookmarkHub');
            setEnableNotify(options.enableNotify as boolean ?? true);
            setEnableAutoSync(options.enableAutoSync as boolean ?? false);
            setEnableIntervalSync(options.enableIntervalSync as boolean ?? false);
            setSyncInterval(Number(options.syncInterval) || 60);
            setEnableEventSync(options.enableEventSync as boolean ?? true);
            setConflictMode((options.conflictMode as 'auto' | 'prompt') || 'auto');
            setStorageType((options.storageType as 'github' | 'webdav') || 'github');
            setWebdavUrl(options.webdavUrl as string || '');
            setWebdavUsername(options.webdavUsername as string || '');
            setWebdavPassword(options.webdavPassword as string || '');
            setWebdavPath(options.webdavPath as string || '/bookmarks.json');
        };
        loadSettings();
    }, []);
    
    useEffect(() => {
        loadBackupRecords();
    }, []);
    
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSaveStatus('saving');
        setValidationErrors([]);
        const errors = validateSettings();
        if (errors.length > 0) {
            setValidationErrors(errors);
            setSaveStatus('idle');
            return;
        }
        try {
            if (masterPassword && masterPassword !== confirmPassword) {
                setValidationErrors([browser.i18n.getMessage('masterPasswordMatchError')]);
                setSaveStatus('idle');
                return;
            }
            await setEncrypted({
                githubToken, gistID, gistFileName, enableNotify, enableAutoSync, enableIntervalSync,
                syncInterval, enableEventSync, conflictMode, storageType, webdavUrl, webdavUsername,
                webdavPassword, webdavPath, masterPassword,
            });
            setMasterPassword('');
            setConfirmPassword('');
            setShowPasswordWarning(false);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (error: unknown) {
            const err = error as Error;
            setValidationErrors([err.message || browser.i18n.getMessage('error')]);
            setSaveStatus('idle');
        }
    };
    
    const handleTestWebDAV = async () => {
        setTestingConnection(true);
        setConnectionStatus(null);
        if (!webdavUrl || !webdavUsername || !webdavPassword) {
            setConnectionStatus({ success: false, message: browser.i18n.getMessage('webdavFieldsRequired') });
            setTestingConnection(false);
            return;
        }
        const result = await testWebDAVConnection(webdavUrl, webdavUsername, webdavPassword);
        setConnectionStatus(result);
        setTestingConnection(false);
    };
    
    return (
        <Container>
            <Form onSubmit={handleSubmit}>
                {validationErrors.length > 0 && (
                    <Card className="mb-3 border-danger" role="alert" aria-live="polite">
                        <Card.Header className="bg-danger text-white">{browser.i18n.getMessage('validationError')}</Card.Header>
                        <Card.Body><ul className="mb-0">{validationErrors.map((error, index) => (<li key={index} className="text-danger">{error}</li>))}</ul></Card.Body>
                    </Card>
                )}
                {saveStatus === 'saved' && (
                    <Card className="mb-3 border-success" role="status" aria-live="polite">
                        <Card.Header className="bg-success text-white">{browser.i18n.getMessage('settingsSavedSuccess')}</Card.Header>
                    </Card>
                )}
                <Card className="mb-3 border-warning">
                    <Card.Header className="bg-warning text-dark"><strong>{browser.i18n.getMessage('masterPasswordOptionalTitle')}</strong></Card.Header>
                    <Card.Body>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3} id="masterPasswordLabel">{browser.i18n.getMessage('masterPasswordLabel')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control type="password" value={masterPassword} onChange={(e) => { 
                                    setMasterPassword(e.target.value); 
                                    const hasMinLength = e.target.value.length >= 12;
                                    const hasUppercase = /[A-Z]/.test(e.target.value);
                                    const hasLowercase = /[a-z]/.test(e.target.value);
                                    const hasNumber = /[0-9]/.test(e.target.value);
                                    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(e.target.value);
                                    setShowPasswordWarning(e.target.value.length > 0 && !(hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar)); 
                                }} placeholder={browser.i18n.getMessage('leaveEmptyPlaceholder')} size="sm" aria-labelledby="masterPasswordLabel" aria-describedby="masterPasswordHelp" />
                                {showPasswordWarning && <small id="masterPasswordHelp" className="text-warning d-block mt-1">Weak password: Must be at least 12 characters with uppercase, lowercase, number, and special character</small>}
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3} id="confirmPasswordLabel">{browser.i18n.getMessage('confirmPasswordLabel')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={browser.i18n.getMessage('confirmPasswordPlaceholder')} size="sm" aria-labelledby="confirmPasswordLabel" />
                            </Col>
                        </Form.Group>
                    </Card.Body>
                </Card>
                <Card className="mb-3">
                    <Card.Header>{browser.i18n.getMessage('githubGist')}</Card.Header>
                    <Card.Body>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('githubToken')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <InputGroup size="sm">
                                    <Form.Control type="password" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="github token" size="sm" />
                                    <InputGroup.Append><Button variant="outline-secondary" as="a" target="_blank" rel="noopener noreferrer" href="https://github.com/settings/tokens/new" size="sm">{browser.i18n.getMessage('getToken')}</Button></InputGroup.Append>
                                </InputGroup>
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistID')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Control type="text" value={gistID} onChange={(e) => setGistID(e.target.value)} placeholder="gist ID" size="sm" /></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistFileName')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Control type="text" value={gistFileName} onChange={(e) => setGistFileName(e.target.value)} placeholder="gist file name" size="sm" /></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('enableNotifications')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Check id="enableNotify" type="switch" checked={enableNotify} onChange={(e) => setEnableNotify(e.target.checked)} aria-label={browser.i18n.getMessage('enableNotifications')} /></Col>
                        </Form.Group>
                    </Card.Body>
                </Card>
                <Card className="mb-3">
                    <Card.Header>{browser.i18n.getMessage('autoSync')}</Card.Header>
                    <Card.Body>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('enableAutoSync')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Check id="enableAutoSync" type="switch" checked={enableAutoSync} onChange={(e) => setEnableAutoSync(e.target.checked)} aria-label={browser.i18n.getMessage('enableAutoSync')} /></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Col sm={12}>
                                <Form.Check id="enableIntervalSync" type="switch" label={browser.i18n.getMessage('intervalSync')} checked={enableIntervalSync} onChange={(e) => setEnableIntervalSync(e.target.checked)} aria-label={browser.i18n.getMessage('intervalSync')} />
                                {enableIntervalSync && <Form.Control as="select" value={syncInterval} onChange={(e) => setSyncInterval(Number(e.target.value))} size="sm" className="d-inline-block ms-4 mt-2" style={{ width: 'auto' }}><option value={60}>{browser.i18n.getMessage('interval60')}</option><option value={720}>{browser.i18n.getMessage('interval720')}</option><option value={1440}>{browser.i18n.getMessage('interval1440')}</option></Form.Control>}
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Col sm={12}><Form.Check id="enableEventSync" type="switch" label={browser.i18n.getMessage('eventSync')} checked={enableEventSync} onChange={(e) => setEnableEventSync(e.target.checked)} aria-label={browser.i18n.getMessage('eventSync')} /></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('conflictMode')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Control as="select" value={conflictMode} onChange={(e) => setConflictMode(e.target.value as 'auto' | 'prompt')} size="sm"><option value="auto">{browser.i18n.getMessage('conflictAuto')}</option><option value="prompt">{browser.i18n.getMessage('conflictPrompt')}</option></Form.Control></Col>
                        </Form.Group>
                    </Card.Body>
                </Card>
                <Card className="mb-3">
                    <Card.Header>{browser.i18n.getMessage('storageService')}</Card.Header>
                    <Card.Body>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('storageType')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Control as="select" value={storageType} onChange={(e) => { setStorageType(e.target.value as 'github' | 'webdav'); setValidationErrors([]); }} size="sm"><option value="github">{browser.i18n.getMessage('githubGist')}</option><option value="webdav">{browser.i18n.getMessage('webdav')}</option></Form.Control></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavUrl')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Control type="text" value={webdavUrl} onChange={(e) => setWebdavUrl(e.target.value)} placeholder="https://your-nas.com/remote.php/dav/files/username/" size="sm" /></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavUsername')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Control type="text" value={webdavUsername} onChange={(e) => setWebdavUsername(e.target.value)} placeholder="username" size="sm" /></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavPassword')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Control type="password" value={webdavPassword} onChange={(e) => setWebdavPassword(e.target.value)} placeholder="password" size="sm" /></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavPath')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}><Form.Control type="text" value={webdavPath} onChange={(e) => setWebdavPath(e.target.value)} placeholder="/bookmarks.json" size="sm" /></Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}></Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Button variant="outline-secondary" size="sm" onClick={handleTestWebDAV} disabled={testingConnection} aria-label={browser.i18n.getMessage('testWebDAVConnection')}>{testingConnection ? browser.i18n.getMessage('testing') : browser.i18n.getMessage('testWebDAVConnection')}</Button>
                                {connectionStatus && <span className={`ml-2 ${connectionStatus.success ? 'text-success' : 'text-danger'}`} role="status" aria-live="polite">{connectionStatus.message}</span>}
                            </Col>
                        </Form.Group>
                    </Card.Body>
                </Card>
                <Card className="mb-3">
                    <Card.Header>{browser.i18n.getMessage('backupHistory') || 'Backup History'}</Card.Header>
                    <Card.Body>
                        {backupRecords.length === 0 ? (
                            <p className="text-muted mb-0">{browser.i18n.getMessage('noBackupRecords') || 'No backup records found. Backups are created automatically when syncing.'}</p>
                        ) : (
                            <Table striped bordered hover size="sm">
                                <thead>
                                    <tr>
                                        <th>{browser.i18n.getMessage('backupTime') || 'Backup Time'}</th>
                                        <th>{browser.i18n.getMessage('bookmarkCount') || 'Bookmarks'}</th>
                                        <th>{browser.i18n.getMessage('actions') || 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {backupRecords.map((record) => (
                                        <tr key={record.backupTimestamp}>
                                            <td>{formatDate(record.backupTimestamp)}</td>
                                            <td>{record.bookmarkCount}</td>
                                            <td>
                                                <Button 
                                                    variant="outline-primary" 
                                                    size="sm" 
                                                    className="me-2"
                                                    onClick={() => handleRestoreBackup(record)}
                                                >
                                                    {browser.i18n.getMessage('restore') || 'Restore'}
                                                </Button>
                                                <Button 
                                                    variant="outline-danger" 
                                                    size="sm"
                                                    onClick={() => handleDeleteBackup(record.backupTimestamp)}
                                                >
                                                    {browser.i18n.getMessage('delete') || 'Delete'}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        )}
                    </Card.Body>
                </Card>
                <Card className="mb-3">
                    <Card.Body className="d-flex justify-content-between align-items-center py-2">
                        <div>
                            <a href="https://github.com/dudor/BookmarkHub" target="_blank" rel="noopener noreferrer">{browser.i18n.getMessage('help')}</a>
                            <span className="mx-2">|</span>
                            <a href="https://github.com/dudor" target="_blank" rel="noopener noreferrer">{browser.i18n.getMessage('author')}</a>
                        </div>
                        <Button type="submit" variant="primary" size="sm" disabled={saveStatus === 'saving'} aria-label={browser.i18n.getMessage('saveSettings')}>{saveStatus === 'saving' ? browser.i18n.getMessage('saving') : browser.i18n.getMessage('saveSettings')}</Button>
                    </Card.Body>
                </Card>
            </Form>
            
            <Modal show={showRestoreModal} onHide={() => setShowRestoreModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>{browser.i18n.getMessage('restoreBackup') || 'Restore Backup'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {restoreStatus === 'restoring' && (
                        <p>{browser.i18n.getMessage('restoring') || 'Restoring bookmarks...'}</p>
                    )}
                    {restoreStatus === 'success' && (
                        <p className="text-success">{browser.i18n.getMessage('restoreSuccess') || 'Backup restored successfully!'}</p>
                    )}
                    {restoreStatus === 'error' && (
                        <p className="text-danger">{browser.i18n.getMessage('restoreFailed') || 'Failed to restore backup.'}</p>
                    )}
                    {restoreStatus === 'idle' && selectedBackup && (
                        <>
                            <p>{browser.i18n.getMessage('confirmRestoreBackup') || 'Are you sure you want to restore this backup? Current bookmarks will be replaced.'}</p>
                            <p><strong>{browser.i18n.getMessage('backupTime') || 'Backup Time'}:</strong> {formatDate(selectedBackup.backupTimestamp)}</p>
                            <p><strong>{browser.i18n.getMessage('bookmarkCount') || 'Bookmarks'}:</strong> {selectedBackup.bookmarkCount}</p>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowRestoreModal(false)} disabled={restoreStatus === 'restoring'}>
                        {browser.i18n.getMessage('cancel') || 'Cancel'}
                    </Button>
                    {restoreStatus === 'idle' && (
                        <Button variant="primary" onClick={confirmRestore}>
                            {browser.i18n.getMessage('restore') || 'Restore'}
                        </Button>
                    )}
                </Modal.Footer>
            </Modal>
        </Container>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>,
  );

import React, { useState, useEffect, FormEvent } from 'react'
import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup, Card } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage, { setEncrypted } from '../../utils/optionsStorage'
import { testWebDAVConnection } from '../../utils/webdav'

/**
 * Options page component for BookmarkHub
 * 
 * Form handling:
 * - Uses explicit save button (no auto-save on change)
 * - Validates only on submit or when explicitly requested
 * - Uses controlled components for better React state management
 */
const Popup: React.FC = () => {
    // Form state - controlled components
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
    
    // UI state
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    
    /**
     * Validate settings based on current storage type
     * @returns Array of validation error messages
     */
    const validateSettings = (): string[] => {
        const errors: string[] = [];
        
        if (storageType === 'github') {
            if (!githubToken || githubToken.trim() === '') {
                errors.push(browser.i18n.getMessage('githubTokenRequired'));
            }
            if (!gistID || gistID.trim() === '') {
                errors.push(browser.i18n.getMessage('gistIdRequired'));
            }
        } else if (storageType === 'webdav') {
            if (!webdavUrl || webdavUrl.trim() === '') {
                errors.push(browser.i18n.getMessage('webdavUrlRequired'));
            }
            if (!webdavUsername || webdavUsername.trim() === '') {
                errors.push(browser.i18n.getMessage('webdavUsernameRequired'));
            }
            if (!webdavPassword || webdavPassword.trim() === '') {
                errors.push(browser.i18n.getMessage('webdavPasswordRequired'));
            }
        }
        
        return errors;
    };
    
    /**
     * Load settings from storage on mount
     */
    useEffect(() => {
        const loadSettings = async () => {
            const options = await optionsStorage.getAll();
            
            // GitHub settings
            setGithubToken(options.githubToken as string || '');
            setGistID(options.gistID as string || '');
            setGistFileName(options.gistFileName as string || 'BookmarkHub');
            setEnableNotify(options.enableNotify as boolean ?? true);
            
            // Auto sync settings
            setEnableAutoSync(options.enableAutoSync as boolean ?? false);
            setEnableIntervalSync(options.enableIntervalSync as boolean ?? false);
            setSyncInterval(Number(options.syncInterval) || 60);
            setEnableEventSync(options.enableEventSync as boolean ?? true);
            setConflictMode((options.conflictMode as 'auto' | 'prompt') || 'auto');
            
            // Storage settings
            setStorageType((options.storageType as 'github' | 'webdav') || 'github');
            setWebdavUrl(options.webdavUrl as string || '');
            setWebdavUsername(options.webdavUsername as string || '');
            setWebdavPassword(options.webdavPassword as string || '');
            setWebdavPath(options.webdavPath as string || '/bookmarks.json');
        };
        
        loadSettings();
    }, []);
    
    /**
     * Handle form submission - save settings to storage
     */
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSaveStatus('saving');
        setValidationErrors([]);
        
        // Validate before saving
        const errors = validateSettings();
        if (errors.length > 0) {
            setValidationErrors(errors);
            setSaveStatus('idle');
            return;
        }
        
        try {
            // Save settings - sensitive fields will be encrypted by setEncrypted
            await setEncrypted({
                githubToken,
                gistID,
                gistFileName,
                enableNotify,
                enableAutoSync,
                enableIntervalSync,
                syncInterval,
                enableEventSync,
                conflictMode,
                storageType,
                webdavUrl,
                webdavUsername,
                webdavPassword,
                webdavPath,
            });
            
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (error: unknown) {
            const err = error as Error;
            setValidationErrors([err.message || 'Failed to save settings']);
            setSaveStatus('idle');
        }
    };
    
    const handleTestWebDAV = async () => {
        setTestingConnection(true);
        setConnectionStatus(null);
        
        if (!webdavUrl || !webdavUsername || !webdavPassword) {
            setConnectionStatus({ success: false, message: 'Please fill in all WebDAV fields' });
            setTestingConnection(false);
            return;
        }
        
        const result = await testWebDAVConnection(webdavUrl, webdavUsername, webdavPassword);
        setConnectionStatus(result);
        setTestingConnection(false);
    };
    
    return (
        <Container>
            {validationErrors.length > 0 && (
                <Card className="mb-3 border-danger">
                    <Card.Header className="bg-danger text-white">{browser.i18n.getMessage('validationError')}</Card.Header>
                    <Card.Body>
                        <ul className="mb-0">
                            {validationErrors.map((error, index) => (
                                <li key={index} className="text-danger">{error}</li>
                            ))}
                        </ul>
                    </Card.Body>
                </Card>
            )}
            
            {saveStatus === 'saved' && (
                <Card className="mb-3 border-success">
                    <Card.Header className="bg-success text-white">Settings Saved Successfully</Card.Header>
                </Card>
            )}
            
            <Form id='formOptions' name='formOptions' onSubmit={handleSubmit}>
                <Card className="mb-3">
                    <Card.Header>{browser.i18n.getMessage('githubGist')}</Card.Header>
                    <Card.Body>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('githubToken')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <InputGroup size="sm">
                                    <Form.Control 
                                        type="password" 
                                        value={githubToken}
                                        onChange={(e) => setGithubToken(e.target.value)}
                                        placeholder="github token" 
                                        size="sm" 
                                    />
                                    <InputGroup.Append>
                                        <Button variant="outline-secondary" as="a" target="_blank" href="https://github.com/settings/tokens/new" size="sm">{browser.i18n.getMessage('getToken')}</Button>
                                    </InputGroup.Append>
                                </InputGroup>
                            </Col>
                        </Form.Group>

                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistID')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control 
                                    type="text" 
                                    value={gistID}
                                    onChange={(e) => setGistID(e.target.value)}
                                    placeholder="gist ID" 
                                    size="sm" 
                                />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistFileName')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control 
                                    type="text" 
                                    value={gistFileName}
                                    onChange={(e) => setGistFileName(e.target.value)}
                                    placeholder="gist file name" 
                                    size="sm" 
                                />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('enableNotifications')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Check
                                    id="enableNotify"
                                    type="switch"
                                    checked={enableNotify}
                                    onChange={(e) => setEnableNotify(e.target.checked)}
                                />
                            </Col>
                        </Form.Group>
                    </Card.Body>
                </Card>
                
                <Card className="mb-3">
                    <Card.Header>{browser.i18n.getMessage('autoSync')}</Card.Header>
                    <Card.Body>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('enableAutoSync')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Check
                                    id="enableAutoSync"
                                    type="switch"
                                    checked={enableAutoSync}
                                    onChange={(e) => setEnableAutoSync(e.target.checked)}
                                />
                            </Col>
                        </Form.Group>
                        
                        <Form.Group as={Row}>
                            <Col sm={12}>
                                <Form.Check
                                    id="enableIntervalSync"
                                    type="switch"
                                    label={browser.i18n.getMessage('intervalSync')}
                                    checked={enableIntervalSync}
                                    onChange={(e) => setEnableIntervalSync(e.target.checked)}
                                />
                                <small className="text-muted d-block ms-4">{browser.i18n.getMessage('intervalSyncDesc')}</small>
                                {enableIntervalSync && (
                                    <Form.Control 
                                        as="select" 
                                        value={syncInterval}
                                        onChange={(e) => setSyncInterval(Number(e.target.value))}
                                        size="sm"
                                        className="d-inline-block ms-4 mt-2"
                                        style={{ width: 'auto' }}
                                    >
                                        <option value={60}>{browser.i18n.getMessage('interval60')}</option>
                                        <option value={720}>{browser.i18n.getMessage('interval720')}</option>
                                        <option value={1440}>{browser.i18n.getMessage('interval1440')}</option>
                                    </Form.Control>
                                )}
                            </Col>
                        </Form.Group>
                        
                        <Form.Group as={Row}>
                            <Col sm={12}>
                                <Form.Check
                                    id="enableEventSync"
                                    type="switch"
                                    label={browser.i18n.getMessage('eventSync')}
                                    checked={enableEventSync}
                                    onChange={(e) => setEnableEventSync(e.target.checked)}
                                />
                                <small className="text-muted d-block ms-4">{browser.i18n.getMessage('eventSyncDesc')}</small>
                            </Col>
                        </Form.Group>
                        
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('conflictMode')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control 
                                    as="select" 
                                    value={conflictMode}
                                    onChange={(e) => setConflictMode(e.target.value as 'auto' | 'prompt')}
                                    size="sm"
                                >
                                    <option value="auto">{browser.i18n.getMessage('conflictAuto')}</option>
                                    <option value="prompt">{browser.i18n.getMessage('conflictPrompt')}</option>
                                </Form.Control>
                            </Col>
                        </Form.Group>
                    </Card.Body>
                </Card>
                
                <Card className="mb-3">
                    <Card.Header>{browser.i18n.getMessage('storageService')}</Card.Header>
                    <Card.Body>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('storageType')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control 
                                    as="select" 
                                    value={storageType}
                                    onChange={(e) => {
                                        setStorageType(e.target.value as 'github' | 'webdav');
                                        setValidationErrors([]);
                                    }}
                                    size="sm"
                                >
                                    <option value="github">{browser.i18n.getMessage('githubGist')}</option>
                                    <option value="webdav">{browser.i18n.getMessage('webdav')}</option>
                                </Form.Control>
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavUrl')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control 
                                    type="text" 
                                    value={webdavUrl}
                                    onChange={(e) => setWebdavUrl(e.target.value)}
                                    placeholder="https://your-nas.com/remote.php/dav/files/username/" 
                                    size="sm" 
                                />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavUsername')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control 
                                    type="text" 
                                    value={webdavUsername}
                                    onChange={(e) => setWebdavUsername(e.target.value)}
                                    placeholder="username" 
                                    size="sm" 
                                />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavPassword')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control 
                                    type="password" 
                                    value={webdavPassword}
                                    onChange={(e) => setWebdavPassword(e.target.value)}
                                    placeholder="password" 
                                    size="sm" 
                                />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavPath')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control 
                                    type="text" 
                                    value={webdavPath}
                                    onChange={(e) => setWebdavPath(e.target.value)}
                                    placeholder="/bookmarks.json" 
                                    size="sm" 
                                />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}></Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Button variant="outline-secondary" size="sm" onClick={handleTestWebDAV} disabled={testingConnection}>
                                    {testingConnection ? browser.i18n.getMessage('testing') : browser.i18n.getMessage('testWebDAVConnection')}
                                </Button>
                                {connectionStatus && (
                                    <span className={`ml-2 ${connectionStatus.success ? 'text-success' : 'text-danger'}`}>
                                        {connectionStatus.message}
                                    </span>
                                )}
                            </Col>
                        </Form.Group>
                    </Card.Body>
                </Card>
                
                <Card className="mb-3">
                    <Card.Body className="d-flex justify-content-between align-items-center py-2">
                        <div>
                            <a href="https://github.com/dudor/BookmarkHub" target="_blank">{browser.i18n.getMessage('help')}</a>
                            <span className="mx-2">|</span>
                            <a href="https://github.com/dudor" target="_blank">{browser.i18n.getMessage('author')}</a>
                        </div>
                        <Button 
                            type="submit" 
                            variant="primary" 
                            size="sm"
                            disabled={saveStatus === 'saving'}
                        >
                            {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
                        </Button>
                    </Card.Body>
                </Card>
            </Form>
        </Container >
    )
}


ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>,
  );
  
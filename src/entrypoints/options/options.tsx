import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup, Card } from 'react-bootstrap';
import { useForm } from "react-hook-form";
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage from '../../utils/optionsStorage'
import { testWebDAVConnection } from '../../utils/webdav'

const Popup: React.FC = () => {
    const { register, setValue } = useForm();
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
    const [enableIntervalSync, setEnableIntervalSync] = useState(false);
    
    useEffect(() => {
        optionsStorage.syncForm('#formOptions').then(() => {
            const intervalSync = (document.querySelector('[name="enableIntervalSync"]') as HTMLInputElement)?.checked;
            setEnableIntervalSync(intervalSync || false);
        });
    }, [])
    
    const handleIntervalSyncChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEnableIntervalSync(e.target.checked);
    };
    
    const handleTestWebDAV = async () => {
        setTestingConnection(true);
        setConnectionStatus(null);
        
        const webdavUrl = (document.querySelector('[name="webdavUrl"]') as HTMLInputElement)?.value;
        const webdavUsername = (document.querySelector('[name="webdavUsername"]') as HTMLInputElement)?.value;
        const webdavPassword = (document.querySelector('[name="webdavPassword"]') as HTMLInputElement)?.value;
        
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
            <Form id='formOptions' name='formOptions'>
                <Card className="mb-3">
                    <Card.Header>{browser.i18n.getMessage('githubGist')}</Card.Header>
                    <Card.Body>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('githubToken')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <InputGroup size="sm">
                                    <Form.Control name="githubToken" ref={register} type="text" placeholder="github token" size="sm" />
                                    <InputGroup.Append>
                                        <Button variant="outline-secondary" as="a" target="_blank" href="https://github.com/settings/tokens/new" size="sm">{browser.i18n.getMessage('getToken')}</Button>
                                    </InputGroup.Append>
                                </InputGroup>
                            </Col>
                        </Form.Group>

                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistID')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control name="gistID" ref={register} type="text" placeholder="gist ID" size="sm" />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistFileName')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control name="gistFileName" ref={register} type="text" placeholder="gist file name" size="sm" />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('enableNotifications')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Check
                                    id="enableNotify"
                                    name="enableNotify"
                                    ref={register}
                                    type="switch"
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
                                    name="enableAutoSync"
                                    ref={register}
                                    type="switch"
                                />
                            </Col>
                        </Form.Group>
                        
                        <Form.Group as={Row}>
                            <Col sm={12}>
                                <Form.Check
                                    id="enableIntervalSync"
                                    name="enableIntervalSync"
                                    ref={register}
                                    type="switch"
                                    label={browser.i18n.getMessage('intervalSync')}
                                    onChange={handleIntervalSyncChange}
                                />
                                <small className="text-muted d-block ms-4">{browser.i18n.getMessage('intervalSyncDesc')}</small>
                                {enableIntervalSync && (
                                    <Form.Control 
                                        name="syncInterval" 
                                        as="select" 
                                        ref={register} 
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
                                    name="enableEventSync"
                                    ref={register}
                                    type="switch"
                                    label={browser.i18n.getMessage('eventSync')}
                                />
                                <small className="text-muted d-block ms-4">{browser.i18n.getMessage('eventSyncDesc')}</small>
                            </Col>
                        </Form.Group>
                        
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('conflictMode')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control name="conflictMode" as="select" ref={register} size="sm">
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
                                <Form.Control name="storageType" as="select" ref={register} size="sm">
                                    <option value="github">{browser.i18n.getMessage('githubGist')}</option>
                                    <option value="webdav">{browser.i18n.getMessage('webdav')}</option>
                                </Form.Control>
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavUrl')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control name="webdavUrl" ref={register} type="text" placeholder="https://your-nas.com/remote.php/dav/files/username/" size="sm" />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavUsername')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control name="webdavUsername" ref={register} type="text" placeholder="username" size="sm" />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavPassword')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control name="webdavPassword" ref={register} type="password" placeholder="password" size="sm" />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row}>
                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('webdavPath')}</Form.Label>
                            <Col sm={9} lg={10} xs={9}>
                                <Form.Control name="webdavPath" ref={register} type="text" placeholder="/bookmarks.json" size="sm" />
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
                    <Card.Body className="d-flex justify-content-between py-2">
                        <a href="https://github.com/dudor/BookmarkHub" target="_blank">{browser.i18n.getMessage('help')}</a>
                        <a href="https://github.com/dudor" target="_blank">{browser.i18n.getMessage('author')}</a>
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
  
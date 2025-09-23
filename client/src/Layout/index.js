import React, { useState,useEffect } from 'react';
import { Container, Row, Col, Navbar, Nav, Image, Button, Offcanvas } from 'react-bootstrap';
import './index.scss';
import TaskOffcanvas from '../components/taskOffcanvas';
import { useTranslation } from 'react-i18next';
import useFingerPrintStore from '../store/fingerPrintStore';


const menuItems = [
  { name: 'introduction', link: '#/' },
  { name: 'chromeManage', link: '#/chromeManager' },
  { name: 'walletManage', link: '#/walletManage' },
  { name: 'syncFunction', link: '#/syncFunction' },
  { name: 'taskManage', link: '#/taskManage' }
];
const langOptions = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
];



const Layout = ({ Child }) => {
  const [showTasksOffcanvas, setShowTasksOffcanvas] = useState(false);
  const [showLangOffcanvas, setShowLangOffcanvas] = useState(false);
  const { t, i18n } = useTranslation();

  const handleLangSelect = (lang) => {
    i18n.changeLanguage(lang);
    setShowLangOffcanvas(false);
  };

  const fetchFingerPrints = useFingerPrintStore((state)=>state.fetchFingerPrints);

  useEffect(() => {
    fetchFingerPrints();
  }, []);

  return (
    <Container fluid className="p-0" style={{ height: '100vh' }}>
      <Row className="g-0" style={{ height: '100%' }}>
        {/* Sidebar */}
        <Col
          md={3}
          className="sidebar d-flex flex-column"
          style={{
            backgroundColor: '#201D32',
            borderRight: '1px solid #dee2e6',
            position: 'fixed',
            height: '100vh'
          }}
        >
          <Navbar expand="md" className="flex-md-column">
            <Navbar.Brand className="navbar-brand-my">
              <Image
                src={`${process.env.PUBLIC_URL}/logo.png`}
                height="50"
                className="d-inline-block align-top"
              />
              Web3ToolBox
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="sidebar-menu" />
            <Navbar.Collapse id="sidebar-menu">
              <Nav className="flex-md-column">
                {menuItems.map((item, idx) => (
                  <Nav.Link key={idx} href={item.link} className="nav-link-my">
                    {t(item.name)}
                  </Nav.Link>
                ))}
              </Nav>
            </Navbar.Collapse>
          </Navbar>
          <div className="mt-auto mb-3 text-center w-100">
            <Button className="mb-2 btn-change-lang" onClick={() => setShowLangOffcanvas(true)}>
              {t('changeLang')}
            </Button>
            <Button
              variant="primary"
              className="btn-task-info"
              onClick={() => setShowTasksOffcanvas(true)}
            >
              {t('taskInfo')}
            </Button>
          </div>
        </Col>

        {/* Language Offcanvas */}
        <Offcanvas
          className="lang-offcanvas"
          show={showLangOffcanvas}
          onHide={() => setShowLangOffcanvas(false)}
          placement="end"
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>{t('selectLang')}</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body className="d-flex flex-column">
            {langOptions.map(opt => (
              <Button
                key={opt.code}
                variant="outline-light"
                className="mb-2"
                onClick={() => handleLangSelect(opt.code)}
              >
                {opt.label}
              </Button>
            ))}
          </Offcanvas.Body>
        </Offcanvas>

        {/* Content */}
        <Col
          md={{ span: 9, offset: 3 }}
          className="content p-0"
          style={{ overflow: 'auto', height: '100vh' }}
        >
          <Child />
          <TaskOffcanvas
            show={showTasksOffcanvas}
            handleClose={() => setShowTasksOffcanvas(false)}
          />
        </Col>
      </Row>
    </Container>
  );
};

export default Layout;

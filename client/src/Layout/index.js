import React, { useState,useEffect } from 'react';
import { Container, Row, Navbar, Nav, Image, Button, Offcanvas } from 'react-bootstrap';
import './index.scss';
import TaskOffcanvas from '../components/taskOffcanvas';
import { useTranslation } from 'react-i18next';
import useFingerPrintStore from '../store/fingerPrintStore';
import { eventEmitter } from '../utils/eventEmitter';

/** Routes where TaskOffcanvas should NOT auto-open (they have their own AI panel) */
const SUPPRESS_OFFCANVAS_ROUTES = ['/agentWorkspace'];


const menuItems = [
  { name: 'introduction', link: '#/', icon: '📘' },
  { name: 'chromeManage', link: '#/chromeManager', icon: '🌐' },
  { name: 'walletManage', link: '#/walletManage', icon: '👛' },
  { name: 'syncFunction', link: '#/syncFunction', icon: '🔄' },
  { name: 'taskManage', link: '#/taskManage', icon: '✅' },
  { name: 'aiAgents', link: '#/aiAgents', icon: '🤖' }
];
const langOptions = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
];



const Layout = ({ Child }) => {
  const [showTasksOffcanvas, setShowTasksOffcanvas] = useState(false);
  const [showLangOffcanvas, setShowLangOffcanvas] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem('layout.sidebarCollapsed') === '1';
  });
  const [isCompactWindow, setIsCompactWindow] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 900;
  });
  const { t, i18n } = useTranslation();

  const handleLangSelect = (lang) => {
    i18n.changeLanguage(lang);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('appLanguage', lang);
    }
    setShowLangOffcanvas(false);
  };

  const fetchFingerPrints = useFingerPrintStore((state)=>state.fetchFingerPrints);

  useEffect(() => {
    fetchFingerPrints();

    const handleTaskExecuted = () => {
      // Don't auto-open TaskOffcanvas on AgentWorkspace — it has its own AI panel
      const hash = window.location.hash || '';
      const isSuppressed = SUPPRESS_OFFCANVAS_ROUTES.some(r => hash.includes(r));
      if (!isSuppressed) {
        setShowTasksOffcanvas(true);
      }
    };
    eventEmitter.on('taskExecuted', handleTaskExecuted);
    return () => {
      eventEmitter.off('taskExecuted', handleTaskExecuted);
    };
  }, [fetchFingerPrints]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem('layout.sidebarCollapsed', isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const onResize = () => setIsCompactWindow(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isSidebarEffectivelyCollapsed = isCompactWindow || isSidebarCollapsed;
  const sidebarWidth = isCompactWindow ? 84 : (isSidebarCollapsed ? 84 : 300);

  return (
    <Container fluid className="p-0" style={{ height: '100vh' }}>
      <Row className="g-0" style={{ height: '100%' }}>
        {/* Sidebar */}
        <aside
          className={`sidebar d-flex flex-column ${isSidebarEffectivelyCollapsed ? 'collapsed' : ''}`}
          style={{ width: `${sidebarWidth}px` }}
        >
          <Navbar expand="md" className="flex-md-column">
            <Navbar.Brand className="navbar-brand-my">
              <Image
                src={`${process.env.PUBLIC_URL}/logo.png`}
                height="50"
                className="d-inline-block align-top"
              />
              {!isSidebarEffectivelyCollapsed ? 'Web3ToolBox' : null}
            </Navbar.Brand>
            {!isCompactWindow ? (
              <Button
                className="sidebar-toggle-btn"
                variant="outline-light"
                size="sm"
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                title={isSidebarCollapsed ? 'Expand Navigation' : 'Collapse Navigation'}
                aria-label={isSidebarCollapsed ? 'Expand Navigation' : 'Collapse Navigation'}
              >
                {isSidebarCollapsed ? '>' : '<'}
              </Button>
            ) : null}
            <Navbar.Toggle aria-controls="sidebar-menu" />
            <Navbar.Collapse id="sidebar-menu">
              <Nav className="flex-md-column">
                {menuItems.map((item, idx) => (
                  <Nav.Link key={idx} href={item.link} className="nav-link-my" title={t(item.name)} data-testid={`nav-${item.name}`}>
                    <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                    {!isSidebarEffectivelyCollapsed ? <span className="nav-label">{t(item.name)}</span> : null}
                  </Nav.Link>
                ))}
              </Nav>
            </Navbar.Collapse>
          </Navbar>
          <div className="mt-auto mb-3 text-center w-100">
            <Button className="mb-2 btn-change-lang" onClick={() => setShowLangOffcanvas(true)} title={t('changeLang')}>
              {isSidebarEffectivelyCollapsed ? <span className="btn-icon">🌍</span> : t('changeLang')}
            </Button>
            <Button
              variant="primary"
              className="btn-task-info"
              data-testid="task-info-button"
              onClick={() => setShowTasksOffcanvas(true)}
              title={t('taskInfo')}
            >
              {isSidebarEffectivelyCollapsed ? <span className="btn-icon">📋</span> : t('taskInfo')}
            </Button>
          </div>
        </aside>

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
        <main
          className={`content p-0 ${isSidebarEffectivelyCollapsed ? 'collapsed' : ''}`}
          style={{ marginLeft: `${sidebarWidth}px`, width: `calc(100% - ${sidebarWidth}px)` }}
        >
          <Child />
          <TaskOffcanvas
            show={showTasksOffcanvas}
            handleClose={() => setShowTasksOffcanvas(false)}
          />
        </main>
      </Row>
    </Container>
  );
};

export default Layout;

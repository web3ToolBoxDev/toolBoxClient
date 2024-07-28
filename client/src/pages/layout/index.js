import React, { useState } from 'react';
import { Container, Row, Col, Navbar, Nav, Image, Button } from 'react-bootstrap';
import './index.scss';
import TaskOffcanvas from '../../components/taskOffcanvas';


const menuItems = [
  { name: '工具箱介绍', link: '#/' },
  { name: '钱包管理', link: '#/walletManage' },
  { name: '任务管理', link: '#/taskManage' },
  { name: '内置任务', link: '#/defaultTask' },
  // Add more items as needed
];

const Layout = ({ Child }) => {
  const [showTasksOffcanvas, setShowTasksOffcanvas] = useState(false);


  return (
    <Container bg="dark" variant="dark" fluid style={{ height: '100vh' }}>
      <Row style={{ height: '100%' }}>
        <Col md={3} style={{
          backgroundColor:
            '#201D32',
          borderRight: '1px solid #dee2e6',
          overflow: 'hidden',
          position: 'fixed',
          height: '100vh',
          weight: '25%'
        }}>
          {/* Sidebar */}
          <Navbar expand="md" className="flex-md-column">
            <Navbar.Brand className='navbar-brand-my' >
              <Image src={`${process.env.PUBLIC_URL}/logo.png`} height="50" className="d-inline-block align-top" />
              Web3ToolBox
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="sidebar-menu" />
            <Navbar.Collapse id="sidebar-menu">
              <Nav className="flex-md-column">
                {menuItems.map((item, index) => (
                  <Nav.Link key={index} href={item.link}
                    className='nav-link-my'
                  >{item.name}</Nav.Link>
                ))}
              </Nav>
            </Navbar.Collapse>
          </Navbar>
          <Button
            variant="primary"
            style={{position: 'absolute', bottom: '10px', width: '70%', marginLeft: '5%', backgroundColor: '#201D32'}}
            onClick={() => {
              setShowTasksOffcanvas(true);
            }}>查看任务信息</Button>

        </Col>
        <Col md={9} style={{
          padding: '0',
          marginLeft: '25%', // 修改这一行
          overflow: 'auto',
          width: '75%'
        }}>
          {/* Content */}
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

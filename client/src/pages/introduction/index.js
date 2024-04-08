import {Container,Button,Row,Col} from 'react-bootstrap';

const Introduction = () => {
  const openTwitter = () => {
    if(window.electronAPI){
      window.electronAPI.openLink('https://twitter.com/Web3_1stToolbox');
    }
  }
  const openIntroduction = () => {
    if(window.electronAPI){
      window.electronAPI.openLink('https://youtu.be/9OFP_NxKi00');
    }
  }
  const openGithub = () => {
    if(window.electronAPI){
      window.electronAPI.openLink('https://github.com/web3ToolBoxDev/toolBoxClient')
    }
  }
  const openUrl = (url) => {
    if(window.electronAPI){
      window.electronAPI.openLink(url)
    }
  }

  return (
    <Container>
      <h1>Web3ToolBox</h1>
      
      <p>大家好，我是阿明，github文档和视频在此，大家可以点击前往，后续工具有任何更新会发布在推文上，各位老板可以关注推特，关注更新内容</p>
      <Button onClick={openIntroduction}>
        使用说明
      </Button>
      <Button onClick={openGithub} className='ms-2'>
        github链接
      </Button>
      <Button onClick={openTwitter} className='ms-2'>
        twitter
      </Button>
      <Row style={{ border: '1px solid black',margin:'5px' }}>
        <Col md={2} style={{ fontSize: '1.5vw', borderRight: '1px solid black' }}>
          V0.1.1新增
        </Col>
        <Col md={8} style={{ fontSize: '1.5vw', borderRight: '1px solid black' }}>
          推特，discord Token配置教程
        </Col>
        <Col md={2}>
          <Button style={{ fontSize: '1.5vw',margin:'1px'}} onClick={() => openUrl('https://www.youtube.com/watch?v=Ew_cG8jhzwY')}>
            查看教程
          </Button>
        </Col>
      </Row>
      <Row style={{ border: '1px solid black',margin:'5px' }}>
        <Col md={2} style={{ fontSize: '1.5vw', borderRight: '1px solid black' }}>
          V0.1.2新增
        </Col>
        <Col md={8} style={{ fontSize: '1.5vw', borderRight: '1px solid black' }}>
          优化任务管理，任务配置教程
        </Col>
        <Col md={2}>
          <Button style={{ fontSize: '1.5vw',margin:'1px'}} onClick={() => openUrl('https://youtu.be/bEUHAOesI0c')}>
            查看教程
          </Button>
        </Col>
      </Row>
      <Row style={{ border: '1px solid black',margin:'5px' }}>
        <Col md={2} style={{ fontSize: '1.5vw', borderRight: '1px solid black' }}>
          V0.1.3新增
        </Col>
        <Col md={8} style={{ fontSize: '1.5vw', borderRight: '1px solid black' }}>
          实现socks5与http的IP代理
        </Col>
        <Col md={2}>
          <Button style={{ fontSize: '1.5vw',margin:'1px'}} onClick={() => openUrl('https://youtu.be/mn8BBE7D5Hk')}>
            查看教程
          </Button>
        </Col>
      </Row>
    </Container>
  );
}

export default Introduction;

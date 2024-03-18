import {Container,Button} from 'react-bootstrap';
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
    </Container>
  );
}
export default Introduction;
import {Container,Button} from 'react-bootstrap';
const Introduction = () => {
  const openTwitter = () => {
    if(window.electronAPI){
      window.electronAPI.openLink('https://twitter.com/Web3_1stToolbox');
    }
  }
  return (
    <Container>
      <h1>Web3ToolBox</h1>
      <Button onClick={openTwitter}>
        twitter
      </Button>
      <p>大家好，我是阿明，说明文档和视频还没搞，等后面做了在此页面更新，各位老板可以进推特点个关注</p>
    </Container>
  );
}
export default Introduction;
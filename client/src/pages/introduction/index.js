import { Container, Button, Card } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import './index.scss';

const Introduction = () => {
  const { t } = useTranslation();

  const openTwitter = () => {
    if (window.electronAPI) {
      window.electronAPI.openLink('https://twitter.com/Web3_1stToolbox');
    }
  };

  const openIntroduction = () => {
    if (window.electronAPI) {
      window.electronAPI.openLink('https://youtu.be/9OFP_NxKi00');
    }
  };

  const openGithub = () => {
    if (window.electronAPI) {
      window.electronAPI.openLink('https://github.com/web3ToolBoxDev/toolBoxClient');
    }
  };

  return (
    <Container className="introduction-page">
      <h1>{t('introduction.heading', 'Web3ToolBox')}</h1>

      <Card className="intro-card">
        <Card.Body>
          <p>{t('introduction.description', '大家好，我是阿明，github文档和视频在此，大家可以点击前往，后续工具有任何更新会发布在推文上，各位老板可以关注推特，关注更新内容')}</p>
          <div className="btn-row">
            <Button className="btn" onClick={openIntroduction}>
              {t('introduction.guideButton', '使用说明')}
            </Button>
            <Button className="btn" onClick={openGithub}>
              {t('introduction.githubButton', 'github链接')}
            </Button>
            <Button className="btn" onClick={openTwitter}>
              {t('introduction.twitterButton', 'twitter')}
            </Button>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default Introduction;

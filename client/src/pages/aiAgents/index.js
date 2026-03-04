import { useState, useEffect } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import APIManager from '../../utils/api';
import { resolveTaskDisplayName } from '../../utils/taskI18n';
import './index.scss';

const AIAgents = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const apiManager = APIManager.getInstance();
  const [agents, setAgents] = useState([]);

  const loadAgents = () => {
    apiManager.getAgentTasks().then((res) => {
      setAgents(Array.isArray(res) ? res : []);
    }).catch(() => setAgents([]));
  };

  useEffect(() => {
    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = (agent) => {
    navigate(`/agentWorkspace/${agent.taskName}`);
  };

  return (
    <div className="ai-agents-page">
      <h1>{t('aiAgents.title', 'AI Agents')}</h1>

      {agents.length === 0 ? (
        <div className="empty-state">
          {t('aiAgents.empty', 'No AI agents available. Import an agent directory to get started.')}
        </div>
      ) : (
        <div className="agent-grid">
          {agents.map((agent) => {
            const displayName = resolveTaskDisplayName(agent, i18n.language);
            const provider = agent.taskSchema?.provider?.defaultValue || 'auto';
            const model = agent.taskSchema?.model?.defaultValue || '-';
            const template = agent.aiSessionTemplate || '-';

            return (
              <div className="agent-card" key={agent.taskName}>
                <div className="agent-header">
                  <div className="agent-icon">🤖</div>
                  <div className="agent-info">
                    <div className="agent-name">{displayName}</div>
                    <div className="agent-provider">
                      {t('aiAgents.provider', 'Provider')}: {provider}
                    </div>
                  </div>
                </div>

                <div className="agent-meta">
                  <span className="meta-tag">
                    {t('aiAgents.model', 'Model')}: {model}
                  </span>
                  <span className="meta-tag">
                    {t('aiAgents.template', 'Template')}: {template}
                  </span>
                </div>

                <div className="agent-actions">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => handleStart(agent)}
                  >
                    {t('aiAgents.startBtn', 'Open Workspace')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AIAgents;

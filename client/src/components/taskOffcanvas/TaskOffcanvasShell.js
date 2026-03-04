import Offcanvas from 'react-bootstrap/Offcanvas';
import { Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

function TaskOffcanvasShell({
    show,
    onClose,
    title,
    canToggleFullscreen,
    isFullscreen,
    onToggleFullscreen,
    isAiMode,
    children,
    actions
}) {
    const { t } = useTranslation();

    return (
        <Offcanvas
            className={`task-offcanvas ${isFullscreen ? 'task-offcanvas--fullscreen' : ''} ${isAiMode ? 'task-offcanvas--ai' : ''}`}
            data-testid="task-offcanvas"
            show={show}
            onHide={onClose}
            placement="bottom"
        >
            <Offcanvas.Header closeButton>
                <Offcanvas.Title>{title}</Offcanvas.Title>
                <div className="header-actions">
                    {canToggleFullscreen ? (
                        <Button
                            className="btn-fullscreen"
                            onClick={onToggleFullscreen}
                        >
                            {isFullscreen ? t('taskLog.exitFullscreen') : t('taskLog.fullscreen')}
                        </Button>
                    ) : null}
                    {actions}
                </div>
            </Offcanvas.Header>
            <Offcanvas.Body>{children}</Offcanvas.Body>
        </Offcanvas>
    );
}

export default TaskOffcanvasShell;

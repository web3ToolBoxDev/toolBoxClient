import APIManager from "../../utils/api";
import { Modal, Button, Row, Col, ButtonGroup, ToggleButton } from "react-bootstrap";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import CustomModal from "../customModal";

const normalizeConfig = (raw = {}) => {
    const knownKeys = ['default', 'envConfigs', 'walletConfigs', 'mode'];
    const flatWalletConfigs = {};
    const flatDefaultConfig = {};
    Object.keys(raw).forEach((k) => {
        if (knownKeys.includes(k)) return;
        if (raw[k] && typeof raw[k] === 'object') {
            flatWalletConfigs[k] = raw[k];
            return;
        }
        flatDefaultConfig[k] = raw[k];
    });
    const mergedWalletConfigs = (raw.walletConfigs && Object.keys(raw.walletConfigs).length > 0)
        ? raw.walletConfigs
        : flatWalletConfigs;
    return {
        mode: raw.mode || 'wallet',
        default: raw.default || flatDefaultConfig || {},
        envConfigs: raw.envConfigs || {},
        walletConfigs: mergedWalletConfigs || {},
    };
};

const SetWalletConfigModal = ({ taskName, configSchema, show, onHide, confirm, isAiTask = false }) => {
    const { t } = useTranslation();
    const apiManager = APIManager.getInstance();
    const [wallets, setWallets] = useState([]);
    const [envs, setEnvs] = useState([]);
    const [configScope, setConfigScope] = useState('wallet'); // wallet | env
    const [modalProp, setModalProp] = useState({ show: false });
    const [config, setConfig] = useState({ default: {}, envConfigs: {}, walletConfigs: {}, mode: 'wallet' });
    const childRef = useRef();

    useEffect(() => {
        if (!show) return;
        apiManager.getAllWallets().then((res) => {
            const newWallets = (res || []).map((wallet) => ({ ...wallet }));
            const sortedWallets = newWallets.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setWallets(sortedWallets);
        });
        apiManager.getFingerPrints().then((res) => {
            if (res && res.success && res.data) {
                const list = Object.values(res.data).map((item) => ({ ...item }));
                const sorted = list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setEnvs(sorted);
            }
        });
        apiManager.getConfigInfo(taskName).then((res) => {
            if (res && res.success) {
                const normalized = normalizeConfig(res.config || {});
                setConfig(normalized);
                setConfigScope(normalized.mode || 'wallet');
            }
        });
    }, [apiManager, taskName, show]);

    const buildTitle = (who) => {
        if (who === 'default') return t('taskManage.editDefaultConfig', '修改通用配置');
        const shortLabel = typeof who === 'string' && who.length > 10 ? `${who.substring(0, 6)}...${who.substring(who.length - 4)}` : who;
        return t('taskManage.editTargetConfig', { target: shortLabel, defaultValue: `修改${shortLabel}的配置` });
    };

    const setConfigProp = async (who) => {
        const mapKey = configScope === 'env' ? 'envConfigs' : 'walletConfigs';
        let record = {};
        try {
            if (isAiTask) {
                record = { ...(config.default || {}) };
            } else {
                record = who === 'default' ? { ...(config.default || {}) } : { ...((config[mapKey] || {})[who]) };
            }
        } catch (e) {
            console.log('error:', e);
        }
        childRef.current?.setValueObj(record);
        const rowList = Object.keys(configSchema || {}).map((key) => {
            if ((configSchema[key] || {}).type === 'input') {
                return [
                    { type: 'label', colWidth: 4, text: configSchema[key].text || key, style: { fontSize: '1.0vw', textAlign: 'right', paddingRight: '10px' } },
                    {
                        type: 'input',
                        colWidth: 6,
                        key,
                        value: record[key],
                        inputType: configSchema[key].inputType || 'text',
                        placeholder: t('taskManage.inputPlaceholder', { field: key, defaultValue: `请输入${key}` }),
                        style: { fontSize: '1.0vw' }
                    }
                ];
            }
            if ((configSchema[key] || {}).type === 'select') {
                return [
                    { type: 'label', colWidth: 4, text: configSchema[key].text || key, style: { textAlign: 'right', paddingRight: '10px' } },
                    { type: 'select', colWidth: 6, key, options: configSchema[key].options, defaultValue: record[key] || configSchema[key].defaultValue }
                ];
            }
            return [];
        });
        rowList.push([
            {
                type: 'button', colWidth: 12, text: t('common.confirm', '确认'), style: { textAlign: 'right' },
                click: () => {
                    setConfig((prev) => {
                        const next = { ...prev, mode: configScope };
                        if (isAiTask || who === 'default') {
                            next.default = { ...record };
                        } else {
                            const nextMap = { ...(next[mapKey] || {}) };
                            nextMap[who] = { ...record };
                            next[mapKey] = nextMap;
                        }
                        return next;
                    });
                    setModalProp({ show: false });
                }
            }
        ]);

        setModalProp({
            show: true,
            title: buildTitle(who),
            handleClose: () => setModalProp({ show: false }),
            handleData: (key, value) => { record[key] = value; },
            rowList
        });
    };

    const handleConfirm = () => {
        const payload = isAiTask ? { default: { ...(config.default || {}) }, mode: 'ai' } : { ...config, mode: configScope };
        confirm(payload);
    };

    const emptyConfig = () => {
        const cleared = { ...config, mode: configScope };
        if (configScope === 'env') {
            cleared.envConfigs = {};
        } else {
            cleared.walletConfigs = {};
        }
        apiManager.setConfigInfo(taskName, cleared).then((res) => {
            if (res) {
                alert(configScope === 'env' ? t('taskManage.clearEnvConfig', '所有环境配置已清空') : t('taskManage.clearWalletConfig', '所有钱包配置已清空'));
                setConfig(cleared);
            }
        });
    };

    const currentList = configScope === 'env' ? envs : wallets;
    const nameLabel = configScope === 'env' ? t('taskManage.envName', '环境名称') : t('taskManage.walletName', '钱包名称');
    const idLabel = configScope === 'env' ? t('taskManage.envId', '环境ID') : t('taskManage.walletAddress', '钱包地址');
    const itemId = (item) => (configScope === 'env' ? (item.id || item._id || item.name) : (item.ethAddress || item.id));
    const itemName = (item) => (item.name || item.alias || item.remark || item.id || item.ethAddress || '');

    return (
        <>
            <Modal show={show} onHide={onHide} centered className="config-modal">
                <Modal.Header closeButton>
                    <div className="config-header">
                        <Modal.Title>{t('taskManage.configTask', '配置任务')}</Modal.Title>
                        <span className="config-hint">{t('taskManage.configHint', '未配置的目标将采用通用配置')}</span>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    {isAiTask ? (
                        <div className="config-toolbar">
                            <div className="config-actions">
                                <Button size="sm" variant="outline-secondary" onClick={() => setConfigProp('default')}>
                                    {t('taskManage.editDefaultConfig', '修改通用配置')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="config-toolbar">
                                <ButtonGroup>
                                    <ToggleButton
                                        id="config-scope-wallet"
                                        type="radio"
                                        variant={configScope === 'wallet' ? 'primary' : 'outline-primary'}
                                        name="configScope"
                                        value="wallet"
                                        checked={configScope === 'wallet'}
                                        onChange={() => setConfigScope('wallet')}
                                        size="sm"
                                    >
                                        {t('taskManage.configByWallet', '按钱包配置')}
                                    </ToggleButton>
                                    <ToggleButton
                                        id="config-scope-env"
                                        type="radio"
                                        variant={configScope === 'env' ? 'primary' : 'outline-primary'}
                                        name="configScope"
                                        value="env"
                                        checked={configScope === 'env'}
                                        onChange={() => setConfigScope('env')}
                                        size="sm"
                                    >
                                        {t('taskManage.configByEnv', '按环境配置')}
                                    </ToggleButton>
                                </ButtonGroup>
                                <div className="config-actions">
                                    <Button size="sm" variant="outline-secondary" onClick={() => setConfigProp('default')}>
                                        {t('taskManage.editDefaultConfig', '修改通用配置')}
                                    </Button>
                                    <Button size="sm" variant="outline-danger" onClick={emptyConfig}>
                                        {configScope === 'env' ? t('taskManage.clearEnvConfig', '清除环境配置') : t('taskManage.clearWalletConfig', '清除钱包配置')}
                                    </Button>
                                </div>
                            </div>

                            <div className="config-list">
                                <Row className="config-list-head">
                                    <Col md={3}>{nameLabel}</Col>
                                    <Col md={5}>{idLabel}</Col>
                                    <Col md={4} className="text-end">{t('taskManage.actions', '操作')}</Col>
                                </Row>
                                <div className="config-list-body">
                                    {currentList.map((item) => {
                                        const id = itemId(item);
                                        return (
                                            <Row key={id} className="config-list-row">
                                                <Col md={3} className="text-truncate" title={itemName(item)}>
                                                    {itemName(item)}
                                                </Col>
                                                <Col md={5} className="text-truncate" title={id}>
                                                    {id}
                                                </Col>
                                                <Col md={4} className="text-end">
                                                    <Button size="sm" variant="outline-primary" onClick={() => setConfigProp(id)}>
                                                        {t('taskManage.editConfig', '修改配置')}
                                                    </Button>
                                                </Col>
                                            </Row>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide}>{t('common.cancel', '取消')}</Button>
                    <Button variant="primary" onClick={handleConfirm}>{t('common.confirm', '确认')}</Button>
                </Modal.Footer>
            </Modal>
            <CustomModal ref={childRef} {...modalProp} />
        </>
    );
};
export default SetWalletConfigModal;

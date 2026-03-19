import APIManager from "./api";
import { sleep } from "../utils"
import useAgentStore from "../store/agentStore";


class WebSocketManager {
    static instance;
    constructor() {
      if (typeof window !== 'undefined' && window.__wsManager) {
        return window.__wsManager;
      }
      if (!WebSocketManager.instance) {
        WebSocketManager.instance = this;
        this.apiManager = new APIManager();
        this._connecting = null;
        this._heartbeatTimer = null;
        this._reconnectTimer = null;
        this._lastCallbacks = null;
        this._messageListeners = new Set();
        this._closeListeners = new Set();
        this._outboundQueue = [];
        this._outboundQueueLimit = 100;
        if (typeof window !== 'undefined') {
          window.__wsManager = this;
        }
      }
      return WebSocketManager.instance;
    }

    static getInstance() {
      if (typeof window !== 'undefined' && window.__wsManager) {
        WebSocketManager.instance = window.__wsManager;
        return window.__wsManager;
      }
      if (!WebSocketManager.instance) {
        WebSocketManager.instance = new WebSocketManager();
      }
      if (typeof window !== 'undefined' && !window.__wsManager) {
        window.__wsManager = WebSocketManager.instance;
      }
      return WebSocketManager.instance;
    }
    startHeartbeat(){
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
      }
      this._heartbeatTimer = setInterval(() => {
        try {
          if (this.wss && this.wss.readyState === WebSocket.OPEN) {
            this.wss.send(JSON.stringify({ type: 'heart_beat' }));
          }
        } catch (error) {
          console.warn('WebSocket heartbeat send failed:', error);
        }
      }, 5000);
    }

    stopHeartbeat(){
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
      }
    }

    async connectWebsocket(messageCallback,closeCallback){
      console.log('Connecting to WebSocket server...');
      const backendReady = await this.ensureBackendReady();
      if (!backendReady) {
        console.warn('Backend WebSocket check failed; skip connecting');
        return false;
      }
      let socket;
      try {
        const clientTag =
        window.__WS_CLIENT_TAG ||
        (window.__WS_CLIENT_TAG = `renderer-${Math.random().toString(16).slice(2)}`);

        console.log('[WS][CLIENT_TAG]', clientTag);
        const wsUrl = `ws://localhost:30001/ws?clientTag=${encodeURIComponent(clientTag)}`;
        console.log('WebSocket URL:', wsUrl);
        socket = new WebSocket(wsUrl);
      } catch (error) {
        console.warn('WebSocket init failed:', error);
        return false;
      }
      this.wss = socket;
      const isCurrent = () => this.wss === socket;
      this.messageQueue = []; // 存储消息的队列
      if (typeof messageCallback === 'function') {
        this._messageListeners.add(messageCallback);
      }
      if (typeof closeCallback === 'function') {
        this._closeListeners.add(closeCallback);
      }
      this._lastCallbacks = { messageCallback, closeCallback };
      let connectTimer = null;
  
      return new Promise((resolve, reject) => {
        connectTimer = setTimeout(() => {
          try {
            if (this.wss && this.wss.readyState !== WebSocket.OPEN) {
              this.wss.close();
            }
          } catch {}
          resolve(false);
        }, 5000);

        this.wss.onopen = () => {
          if (!isCurrent()) return;
          this.startHeartbeat();
          this.flushOutboundQueue();
          resolve(true);
        };

        this.wss.onmessage = async (event) => {
          let message;
          try {
            let raw = event.data;
            if (raw instanceof Blob) {
              raw = await raw.text();
            } else if (raw instanceof ArrayBuffer) {
              raw = new TextDecoder().decode(raw);
            }
            message = JSON.parse(raw);
          } catch (error) {
            console.warn('WebSocket message parse failed:', error, event.data);
            return;
          }
          if (!isCurrent()) return;

          // ── Agent state sync (Phase 3) ──
          if (message.type === 'agent_state_patch' && message.patch) {
            try {
              useAgentStore.getState().applyPatch(message.patch);
            } catch (err) {
              console.warn('[WS] agent_state_patch apply failed:', err);
            }
          } else if (message.type === 'agent_state_snapshot' && message.agentId) {
            try {
              useAgentStore.getState().applySnapshot(message.agentId, message.snapshot);
            } catch (err) {
              console.warn('[WS] agent_state_snapshot apply failed:', err);
            }
          }

          this.pushToQueue(message);
          this._messageListeners.forEach((listener) => {
            try {
              listener(message);
            } catch (error) {
              console.warn('WebSocket message listener failed:', error);
            }
          });
        };
  
        this.wss.onclose = async(event) => {
          if (!isCurrent()) return;
          if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
          }
          this.stopHeartbeat();
          this._closeListeners.forEach((listener) => {
            try {
              listener(event);
            } catch (error) {
              console.warn('WebSocket close listener failed:', error);
            }
          });
          const reason = String(event?.reason || '').toLowerCase();
          if (reason.includes('duplicate frontend connection')) {
            // An older socket is kept by server; avoid reconnect loop
            resolve(false);
            return;
          }
          this.scheduleReconnect();
          resolve(false);
        };
  
        this.wss.onerror = async(error) => {
          if (!isCurrent()) return;
          if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
          }
          this.stopHeartbeat();
          console.log('WebSocket error:', error);
          this.scheduleReconnect();
          resolve(false);
        };
      });
    }

    scheduleReconnect() {
      if (this._reconnectTimer) return;
      this._reconnectTimer = setTimeout(async () => {
        this._reconnectTimer = null;
        const callbacks = this._lastCallbacks;
        if (!callbacks || !callbacks.messageCallback) return;
        await this.connect(callbacks.messageCallback, callbacks.closeCallback, 3);
      }, 1500);
    }

    async ensureBackendReady() {
      const checkOnce = async () => {
        const res = await this.apiManager.checkWebSocket();
        return res && res.success !== false;
      };

      try {
        const ready = await checkOnce();
        if (ready) return true;
      } catch (err) {
        console.warn('Backend WebSocket check failed (first attempt):', err?.message || err);
      }

      await sleep(500);

      try {
        const ready = await checkOnce();
        if (!ready) {
          console.warn('Backend WebSocket not ready after retry');
        }
        return ready;
      } catch (error) {
        console.warn('Backend WebSocket not ready:', error?.message || error);
        return false;
      }
    }
    
    async connect(messageCallback,closeCallback,tryCount=5){ 
      if (this.wss && this.wss.readyState === WebSocket.OPEN) {
        if (typeof messageCallback === 'function') {
          this._messageListeners.add(messageCallback);
        }
        if (typeof closeCallback === 'function') {
          this._closeListeners.add(closeCallback);
        }
        return true;
      }
      if (this.wss && this.wss.readyState === WebSocket.CONNECTING && this._connecting) {
        if (typeof messageCallback === 'function') {
          this._messageListeners.add(messageCallback);
        }
        if (typeof closeCallback === 'function') {
          this._closeListeners.add(closeCallback);
        }
        return await this._connecting;
      }
      if (this._connecting) {
        return await this._connecting;
      }
      while(tryCount>0){
        this._connecting = this.connectWebsocket(messageCallback,closeCallback);
        const connected = await this._connecting;
        this._connecting = null;
        if(connected){
          return true;
        }
        await sleep(1000);
        tryCount--;
      }
      return false;
        
    }
  
    // 将消息推入队列
    pushToQueue(message) {
      this.messageQueue.push(message);
    }
  
    // 从队列中取出并删除第一条消息
    popFromQueue() {
      return this.messageQueue.shift();
    }
  
    // 获取队列长度
    getQueueLength() {
      return this.messageQueue.length;
    }
    sendMessage(message){
        if (this.wss && this.wss.readyState === 1) {
            this.wss.send(message);
            return true;
        }
        this.enqueueOutbound(message);
        return false;
    }
    enqueueOutbound(message) {
      if (!this._outboundQueue) {
        this._outboundQueue = [];
      }
      this._outboundQueue.push(message);
      if (this._outboundQueue.length > this._outboundQueueLimit) {
        this._outboundQueue.splice(0, this._outboundQueue.length - this._outboundQueueLimit);
      }
    }
    flushOutboundQueue() {
      if (!this.wss || this.wss.readyState !== 1 || !Array.isArray(this._outboundQueue) || this._outboundQueue.length === 0) {
        return;
      }
      const queued = this._outboundQueue.slice();
      this._outboundQueue = [];
      queued.forEach((item) => {
        try {
          this.wss.send(item);
        } catch (error) {
          this.enqueueOutbound(item);
        }
      });
    }
    addMessageListener(listener) {
      if (typeof listener === 'function') {
        this._messageListeners.add(listener);
      }
    }
    removeMessageListener(listener) {
      if (typeof listener === 'function') {
        this._messageListeners.delete(listener);
      }
    }
    addCloseListener(listener) {
      if (typeof listener === 'function') {
        this._closeListeners.add(listener);
      }
    }
    removeCloseListener(listener) {
      if (typeof listener === 'function') {
        this._closeListeners.delete(listener);
      }
    }
    //检查连接状态
    checkConnection(){
      if(this.wss && this.wss.readyState === 1){
        return true;
      }else{
        return false;
      }
    }

    // 关闭WebSocket连接
    close() {
      if (this.wss) {
        this.stopHeartbeat();
        this.wss.close();
        this.wss = null; // 清除引用
      }
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      this._messageListeners.clear();
      this._closeListeners.clear();
      this._outboundQueue = [];
    }
  }
  
  export default WebSocketManager;
  

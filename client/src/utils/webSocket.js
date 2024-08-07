import APIManager from "./api";
import { sleep } from "../utils"


class WebSocketManager {
    static instance;
    constructor() {
      if (!WebSocketManager.instance) {
        WebSocketManager.instance = this;
        this.apiManager = new APIManager();
      }
      return WebSocketManager.instance;
    }

    static getInstance() {
      if (!WebSocketManager.instance) {
        WebSocketManager.instance = new WebSocketManager();
      }
      return WebSocketManager.instance;
    }
    async connectWebsocket(messageCallback,closeCallback){
      this.wss = new WebSocket('ws://localhost:30001/ws');
      this.messageQueue = []; // 存储消息的队列
  
      return new Promise((resolve, reject) => {
        this.wss.onopen = () => {
          resolve(true);
        };
  
        this.wss.onmessage = (event) => {
          let message = JSON.parse(event.data);
          this.pushToQueue(message);
          // 使用回调函数处理消息，为防止遗漏,使用this.popFromQueue()获取消息
          messageCallback();
        };
  
        this.wss.onclose = async(event) => {
          closeCallback(event);
          resolve(false);
        };
  
        this.wss.onerror = async(error) => {
          console.log('WebSocket error:', error);
          resolve(false);
        };
      });
    }
    
    async connect(messageCallback,closeCallback,tryCount=5){ 
      if(this.wss){
        this.wss.close();
      }
      while(tryCount>0){
        let connected = await this.connectWebsocket(messageCallback,closeCallback);
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
        if(this.wss.readyState === 1){
            this.wss.send(message);
        }
    }
    //检查连接状态
    checkConnection(){
      if(this.wss.readyState === 1){
        return true;
      }else{
        return false;
      }
    }
  }
  
  export default WebSocketManager;
  
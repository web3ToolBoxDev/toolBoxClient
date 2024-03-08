class WebSocketManager {
    static instance;
    constructor() {
      if (!WebSocketManager.instance) {
        WebSocketManager.instance = this;
      }
      return WebSocketManager.instance;
    }

    static getInstance() {
      if (!WebSocketManager.instance) {
        WebSocketManager.instance = new WebSocketManager();
      }
      return WebSocketManager.instance;
    }
    
    connect(messageCallback,closeCallback){ 
        this.wss = new WebSocket('ws://localhost:30001/ws');
        this.messageQueue = []; // 存储消息的队列
        this.wss.onopen = () => {
          console.log('connected');
        };
        this.wss.onmessage = (event) => {
          let message = JSON.parse(event.data);
          this.pushToQueue(message);
          //使用回调函数处理消息，为防止遗漏,使用this.popFromQueue()获取消息
          messageCallback();
        };
        this.wss.onclose = (event) => {
          console.log('连接关闭:', event);
          closeCallback(event);
        };
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
  }
  
  export default WebSocketManager;
  
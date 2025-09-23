const portscanner = require('portscanner');
const SocksServer = require('./socksServer');
const ProxyChain = require('proxy-chain');
class ProxyManager{
    static instance = null;
    constructor(){
        if(!ProxyManager.instance){
            ProxyManager.instance = this;
            this.serverList = {};
        }
        return ProxyManager.instance;
    }
    static getInstance(){
        if(!ProxyManager.instance){
            console.log('new ProxyManager');
            ProxyManager.instance = new ProxyManager();
        }
        return ProxyManager.instance;
    }
    async createServer(taskId,ipType,ipHost,ipPort,ipUsername,ipPassword){
        let url = '';
        console.log('createServer参数:', {taskId,ipType,ipHost,ipPort,ipUsername,ipPassword});
        if(!ipHost || !ipPort){
            console.error('createServer参数缺失:', {ipHost, ipPort});
            return '';
        }
        if(this.serverList[taskId]){
            this.serverList[taskId].close();
        }
        // 兼容 socket/socks5
        if(ipType === 'socks5' || ipType === 'socket'){
            ({server:this.serverList[taskId], url} = await this.createSocksServer(ipHost, ipPort,ipUsername,ipPassword));
        }
        if(ipType === 'http'){
            ({server:this.serverList[taskId], url} = await this.createHttpServer(ipHost, ipPort,ipUsername,ipPassword));
        }
        console.log('createServer生成url:',url);
        return url;
    }
    async createSocksServer(socksHost, socksPort,socksUsername,socksPassword){
        const listenHost = '127.0.0.1';
        const listenPort = await portscanner.findAPortNotInUse(30000, 40000);
        const options = {
            listenHost,
            listenPort,
            socksHost,
            socksPort:+socksPort,
            // 仅在有用户名/密码时传递
            ...(socksUsername ? { socksUsername } : {}),
            ...(socksPassword ? { socksPassword } : {})
        };
        console.log('options:',options);
        
        let socksServer = SocksServer(options);

        socksServer.on('connect:error', err => {
            console.error(err);
          });
        socksServer.on('request:error', err => {
            console.error(err);
          });
        return {server:socksServer,url:`http://${listenHost}:${listenPort}`};
    }
    async createHttpServer(httpHost, httpPort, username, password){
        const listenPort = await portscanner.findAPortNotInUse(30000, 40000);
        // 构造 oldProxyUrl 时用户名/密码可选
        let oldProxyUrl = '';
        if(username && password){
            oldProxyUrl = `http://${username}:${password}@${httpHost}:${httpPort}`;
        } else {
            oldProxyUrl = `http://${httpHost}:${httpPort}`;
        }
        
        const newProxyUrl = await ProxyChain.anonymizeProxy({
          url: oldProxyUrl,
          port: listenPort,
        });
        let server = new ProxyChain.Server({
          port: listenPort,
        });
        server.listen(() => {
          console.log(`Proxy server is listening on port ${listenPort}`);
        });
        return {server,url:newProxyUrl};
        
      }
    
    async stop(taskId){
        if(this.serverList[taskId]){
            this.serverList[taskId].close();
            delete this.serverList[taskId];
        }
    }

    

}
const proxyManager = ProxyManager.getInstance();
module.exports = proxyManager;

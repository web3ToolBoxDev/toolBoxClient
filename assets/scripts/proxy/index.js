
const portscanner = require('portscanner');
const SocksServer = require('./socksServer');
const ProxyChain = require('proxy-chain');
class ProxyManager{
    static instance = null;
    constructor(){
        if(!ProxyManager.instance){
            ProxyManager.instance = this;
            this.socksServer = null;
            this.proxyChain = null;
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
    async createSocksServer(socksHost, socksPort,socksUsername,socksPassword){
        const listenHost = '127.0.0.1';
        const listenPort = await portscanner.findAPortNotInUse(30000, 40000);
        const options = {
            listenHost,
            listenPort,
            socksHost,
            socksPort:+socksPort,
            socksUsername,
            socksPassword,
        };
        console.log('options:',options);
        if(this.socksServer){
            this.socksServer.close();
        }
        this.socksServer = SocksServer(options);

        this.socksServer.on('connect:error', err => {
            console.error(err);
          });
        this.socksServer.on('request:error', err => {
            console.error(err);
          });
        return `${listenHost}:${listenPort}`;
    }
    async createHttpServer(httpHost, httpPort, username, password){
        const listenPort = await portscanner.findAPortNotInUse(30000, 40000);
        if(this.httpServer){
            this.httpServer.close();
        }
      
        const oldProxyUrl = `http://${username}:${password}@${httpHost}:${httpPort}`;
        const newProxyUrl = await ProxyChain.anonymizeProxy({
          url: oldProxyUrl,
          port: listenPort,
        });
        this.httpServer = new ProxyChain.Server({
          port: listenPort,
        });
        this.httpServer.listen(() => {
          console.log(`Proxy server is listening on port ${listenPort}`);
        });
        return newProxyUrl;
        
      }
    
    async stop(){
        if(this.socksServer){
            this.socksServer.close();

        }
        if(this.httpServer){
            this.httpServer.close();
        }
    }

    

}
const proxyManager = ProxyManager.getInstance();
module.exports = proxyManager;

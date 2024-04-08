const http = require('http');
const url = require('url');
const socks = require('socks');
const {EventEmitter} = require('events');
const socks_proxy_agent = require('socks-proxy-agent');
class HttpProxy extends EventEmitter {
    constructor(options) {
        super();
        this.opt = {
            listenHost: 'localhost',
            listenPort: 12333,
            socksHost: 'localhost',
            socksPort: 1080,
        };
        this.proxy = {
            ipaddress: '127.0.0.1',
            port: 7890,
            type: 5,
        };
        this.opt = Object.assign(Object.assign({}, this.opt), options);
        this.proxy = {
            ipaddress: this.opt.socksHost,
            port: this.opt.socksPort,
            type: 5,
            userId: this.opt.socksUsername || '',
            password: this.opt.socksPassword || '',
        };
    }
    _request(proxy, uReq, uRes) {
        const u = url.parse(uReq.url);
        const socksAgent = new socks_proxy_agent.SocksProxyAgent(`socks://${proxy.userId}:${proxy.password}@${proxy.ipaddress}:${proxy.port}`);
        const options = {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.path,
            method: uReq.method || 'get',
            headers: uReq.headers,
            agent: socksAgent,
        };
        const pReq = http.request(options);
        pReq
            .on('response', pRes => {
            pRes.pipe(uRes);
            uRes.writeHead(pRes.statusCode, pRes.headers);
            this.emit('request:success');
        })
            .on('error', e => {
            uRes.writeHead(500);
            uRes.end('Connection error\n');
            this.emit('request:error', e);
        });
        uReq.pipe(pReq);
    }
    _connect(proxy, uReq, uSocket, uHead) {
        const u = url.parse(`http://${uReq.url}`);
        const options = {
            proxy,
            destination: { host: u.hostname, port: u.port ? +u.port : 80 },
            command: 'connect',
        };
        socks.SocksClient.createConnection(options, (error, pSocket) => {
            if (error) {
                uSocket === null || uSocket === void 0 ? void 0 : uSocket.write(`HTTP/${uReq.httpVersion} 500 Connection error\r\n\r\n`);
                this.emit('connect:error', error);
                return;
            }
            pSocket === null || pSocket === void 0 ? void 0 : pSocket.socket.pipe(uSocket);
            if (pSocket === null || pSocket === void 0 ? void 0 : pSocket.socket) {
                uSocket === null || uSocket === void 0 ? void 0 : uSocket.pipe(pSocket === null || pSocket === void 0 ? void 0 : pSocket.socket);
            }
            pSocket === null || pSocket === void 0 ? void 0 : pSocket.socket.on('error', err => {
                this.emit('connect:error', err);
            });
            uSocket.on('error', err => {
                this.emit('connect:error', err);
            });
            pSocket === null || pSocket === void 0 ? void 0 : pSocket.socket.write(uHead);
            uSocket === null || uSocket === void 0 ? void 0 : uSocket.write(`HTTP/${uReq.httpVersion} 200 Connection established\r\n\r\n`);
            this.emit('connect:success');
            pSocket === null || pSocket === void 0 ? void 0 : pSocket.socket.resume();
        });
    }
    start() {
        this.server = http.createServer();
        console.log(`Socks server listening on ${this.opt.listenHost}:${this.opt.listenPort}`);
        this.server.on('request',(...args) => this._request(this.proxy, ...args));
        this.server.on('connect',(...args) => this._connect(this.proxy, ...args));
        return this.server.listen(this.opt.listenPort, this.opt.listenHost);
    }


}

function SocksServer(opt) {
    console.log(`Listen on ${opt.listenHost}:${opt.listenPort}, and forward traffic to ${opt.socksHost}:${opt.socksPort}`);
    const proxy = new HttpProxy(opt);
    return proxy.start();
}
module.exports = SocksServer;
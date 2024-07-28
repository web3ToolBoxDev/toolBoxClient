const axios = require('axios');
const proxyManager = require('../proxy/index');
const {HttpProxyAgent} = require('http-proxy-agent');
const {IP2Location} = require('ip2location-nodejs');
const {find} = require('geo-tz');
const config = require('../../config').getInstance();
const ip2LocationDbPath = config.getIp2LocationDbPath();
const ip2location = new IP2Location();
const {Mutex} = require('async-mutex');
const mutex = new Mutex();

ip2location.open(ip2LocationDbPath);
async function startProxy(taskId,ipType,ipHost,ipPort,ipUsername,ipPassword){
    const release = await mutex.acquire();
    let url = await proxyManager.createServer(taskId,ipType,ipHost,ipPort,ipUsername,ipPassword);
    release();
    return url;
        
}

async function stopProxy(taskId){
    console.log('stopProxy taskId:',taskId);
    proxyManager.stop(taskId);
}


async function checkProxy(ipType,ipHost,ipPort,ipUsername,ipPassword){
    const url = await startProxy('check',ipType,ipHost,ipPort,ipUsername,ipPassword);
    console.log('url:',url);
    const agent = new HttpProxyAgent(url);
    let cnt = 0
    while(cnt < 3){
        try{
            const res = await Promise.race([
                axios.get('http://ip-api.com/json/?fields=61439',{httpAgent:agent,timeout:5000}),
                axios.get('https://api64.ipify.org?format=json',{httpsAgent:agent,timeout:5000})
            ]);
            let ip = '';
            if(res.data.ip){
                ip = res.data.ip;}
            else if(res.data.query){
                ip = res.data.query;
            }else{
                stopProxy('check');
                return {success:false};
            }
            const ipInfo = ip2location.getAll(ip);
            const {latitude, longitude, countryShort} = ipInfo;
            const timeZone = find(Number(latitude), Number(longitude));
            stopProxy('check');
            return {success:true,ipInfo:{ip,
                                        ll: [latitude, longitude],
                                        country:countryShort,
                                        timeZone:timeZone[0]}};
        }catch(e){
            cnt++;
            console.error(e);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    stopProxy('check');
    return {success:false};
}

module.exports = {
    startProxy,
    stopProxy,
    checkProxy
};

const axios = require('axios');
const proxyManager = require('../proxy/index');
const {HttpProxyAgent} = require('http-proxy-agent');

const {Mutex} = require('async-mutex');
const mutex = new Mutex();

// ip2location.open(ip2LocationDbPath);
async function startProxy(taskId,ipType,ipHost,ipPort,ipUsername,ipPassword){
    if(!ipHost || !ipPort){
        console.error('startProxy参数缺失:', {ipType, ipHost, ipPort, ipUsername, ipPassword});
        return '';
    }
    const release = await mutex.acquire();
    let url = await proxyManager.createServer(taskId,ipType,ipHost,ipPort,ipUsername,ipPassword);
    release();
    return url;
        
}

async function stopProxy(taskId){
    console.log('stopProxy taskId:',taskId);
    proxyManager.stop(taskId);
}

async function checkAndStartProxy(taskId,ipType,ipHost,ipPort,ipUsername,ipPassword){
    if(!ipHost || !ipPort){
        return {success:false, code:4001, message:'IP address or port is missing'};
    }
    const release = await mutex.acquire();
    let url = await proxyManager.createServer(taskId,ipType,ipHost,ipPort,ipUsername,ipPassword);
    release();
    if(!url){
        return {success:false, code:4002, message:'Proxy creation failed: URL is empty'};
    }
    let agent;
    try {
        agent = new HttpProxyAgent(url);
    } catch (e) {
        return {success:false, code:4003, message:'Invalid proxy URL: '+e.message};
    }
    let cnt = 0;
    while(cnt < 3){
        try{
            const res = await Promise.race([
                axios.get('http://ip-api.com/json/?fields=61439',{httpAgent:agent,timeout:5000}),
                axios.get('https://ipinfo.io/json',{httpsAgent:agent,timeout:5000})
            ]);
            if(res.status !== 200) {
                stopProxy(taskId);
                return {success: false, code:4004, message: `Proxy request failed: ${res.status} ${res.statusText}`};
            }
            let ip = '';
            let latitude = '';
            let longitude = '';
            let country = '';
            let timeZone = '';
            if(res.data.ip){
                ip = res.data.ip;
                [latitude, longitude] = res.data.loc.split(',');
                country = res.data.country || '';
                timeZone = res.data.timezone || '';
            }
            else if(res.data.query){
                ip = res.data.query;
                latitude = res.data.lat || '';
                longitude = res.data.lon || '';
                country = res.data.countryCode || '';
                timeZone = res.data.timezone || '';
            }else{
                stopProxy(taskId);
                return {success:false, code:4005, message:'No IP found in proxy response'};
            }
            return {success:true,data:{url,ip,
                                        position:{latitude,longitude},
                                        country:country,
                                        timeZone}};
        }catch(e){
            cnt++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            if(cnt >= 3){
                stopProxy(taskId);
                return {success:false, code:4006, message: (e && e.message) ? e.message : String(e)};
            }
        }
    }
    stopProxy(taskId);
    return {success:false, code:4007, message:'Proxy check failed: unknown error'};
}

async function checkProxy(ipType,ipHost,ipPort,ipUsername,ipPassword){
    const url = await startProxy('check',ipType,ipHost,ipPort,ipUsername,ipPassword);
    if(!url){
        stopProxy('check');
        return {success:false, code:4002, message:'Proxy creation failed: URL is empty'};
    }
    let agent;
    try {
        agent = new HttpProxyAgent(url);
    } catch (e) {
        stopProxy('check');
        return {success:false, code:4003, message:'Invalid proxy URL: '+e.message};
    }
    let cnt = 0
    while(cnt < 3){
        try{
            const res = await Promise.race([
                axios.get('http://ip-api.com/json/?fields=61439',{httpAgent:agent,timeout:5000}),
                axios.get('https://ipinfo.io/json',{httpsAgent:agent,timeout:5000})
            ]);
            if(res.status !== 200) {
                stopProxy('check');
                return {success: false, code:4004, message: `Proxy request failed: ${res.status} ${res.statusText}`};
            }
            let ip = '';
            let latitude = '';
            let longitude = '';
            let country = '';
            let timeZone = '';
            if(res.data.ip){
                ip = res.data.ip;
                [latitude, longitude] = res.data.loc.split(',');
                country = res.data.country || '';
                timeZone = res.data.timezone || '';
            }
            else if(res.data.query){
                ip = res.data.query;
                latitude = res.data.lat || '';
                longitude = res.data.lon || '';
                country = res.data.countryCode || '';
                timeZone = res.data.timezone || '';
            }else{
                stopProxy('check');
                return {success:false, code:4005, message:'No IP found in proxy response'};
            }
            stopProxy('check');
            return {success:true,data:{ip,
                                        position:{latitude,longitude},
                                        country:country,
                                        timeZone}};
        }catch(e){
            cnt++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            if(cnt >= 3){
                stopProxy('check');
                return {success:false, code:4006, message: (e && e.message) ? e.message : String(e)};
            }
        }
    }
    stopProxy('check');
    return {success:false, code:4007, message:'Proxy check failed: unknown error'};
}

module.exports = {
    startProxy,
    stopProxy,
    checkProxy,
    checkAndStartProxy
};

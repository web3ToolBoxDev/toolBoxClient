
const {eventEmitter} = require('./eventEmitter');
const shortAddress = (address) => {
    return address.substring(0, 6) + '...' + address.substring(address.length - 4, address.length);
}
async function sleep(time) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, time);
    });
}

const formatNumber = (num) => {
    if(num <1){
        return Number(num).toPrecision(4);
    }else{
        //保留两位小数，不要四舍五入
        return Math.floor(num * 100) / 100;
    }
}
const log = (message) => {
    let time = new Date().toLocaleString();
    eventEmitter.emit('clientTaskMessage', `${time}:${message}`);
}

export {
    shortAddress,
    sleep,
    formatNumber,
    log
}
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
        return Number(num).toFixed(2);
    }
}
export {
    shortAddress,
    sleep,
    formatNumber
}
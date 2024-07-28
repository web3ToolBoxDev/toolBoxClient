const fs = require('fs');
// Function to create directory if it does not exist
function createDirectoryIfNotExists(directory) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    return directory;
}
async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
const shortAddress = (address) => {
    return address.substring(0, 6) + '...' + address.substring(address.length - 4, address.length);
}

const formatNumber = (num) => {
    if(num <1){
        return Number(num).toPrecision(4);
    }else{
        return Number(num).toFixed(2);
    }
}
module.exports = {
    createDirectoryIfNotExists,
    sleep,
    shortAddress,
    formatNumber
};
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
module.exports = {
    createDirectoryIfNotExists,
    sleep
};
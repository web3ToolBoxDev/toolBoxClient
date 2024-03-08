IS_BUILD = true;

class Config {
    static instance = null;
    constructor() {
        if (!Config.instance) {
            Config.instance = this;
            this.isBuild = IS_BUILD;
        }
        return Config.instance;
    }
    static getInstance() {
        if (!Config.instance) {
            console.log('new Config');
            Config.instance = new Config();
        }
        return Config.instance;
    }
    getIsBuild() {
        return this.isBuild;
    }
}
module.exports = Config;
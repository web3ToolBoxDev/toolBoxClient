import { ethers } from 'ethers';

class Web3Manager {
    static instance = null;

    constructor() {
        if (!Web3Manager.instance) {
            Web3Manager.instance = this;
            // 在构造函数中进行初始化
        }
        return Web3Manager.instance;
    }

    static getInstance() {
        if (!Web3Manager.instance) {
            Web3Manager.instance = new Web3Manager();
        }
        return Web3Manager.instance;
    }

    // 添加其他方法和属性
    getProvider() {
        return this.provider;
    }

    // 生成助记词
    generateMnemonic() {
        return ethers.Wallet.createRandom().mnemonic.phrase;
    }
    
    // 通过助记词生成私钥
    getPrivateKeyFromMnemonic(mnemonic) {
        const wallet = ethers.Wallet.fromPhrase(mnemonic);
        return wallet.privateKey;
    }
    
    // 通过私钥生成地址
    getAddressFromPrivateKey(privateKey) {
        const wallet = new ethers.Wallet(privateKey);
        return wallet.address;
    }
    
    // 生成钱包
    createWallet() {
        const wallet = ethers.Wallet.createRandom();
        return {
            mnemonic: wallet.mnemonic.phrase,
            privateKey: wallet.privateKey,
            address: wallet.address,
        };
    }
}

export default Web3Manager;

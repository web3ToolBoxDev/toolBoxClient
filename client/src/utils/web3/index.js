import { ethers } from 'ethers';
import network from './network.json';
import ierc20 from './IERC20Metadata.json';


class Web3Manager {
    static instance = null;

    constructor() {
        if (!Web3Manager.instance) {
            Web3Manager.instance = this;
            // 在构造函数中进行初始化
        }
        this.network = network;
        this.ierc20Abi = ierc20.abi;
        return Web3Manager.instance;
    }

    static getInstance() {
        if (!Web3Manager.instance) {
            Web3Manager.instance = new Web3Manager();
        }
        return Web3Manager.instance;
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

    // 检测地址是否合法
    checkAddress(address) {
        return ethers.isAddress(address);
    }

    async checkRpc(rpc, retries = 3, delay = 1000) {
        let provider = new ethers.JsonRpcProvider(rpc);
        while (retries > 0) {
            try {
                await provider.getBlockNumber();
                provider.destroy();
                return true;
            } catch (error) {
                console.error('RPC check failed:', error);
                if (--retries === 0) {
                    provider.destroy();
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return false;
    }

    // 获取可用的网络列表
    getNetworkList() {
        const networkList = [];
        // 输出network.json中的property，不要输出default属性    
        for (const key in this.network) {
            if (key !== 'default') {
                networkList.push(key);
            }
        }
        return networkList;
    }

    // 获取网络rpc
    async getRpc(networkName) {
        for (const rpc of this.network[networkName]) {
            try {
                if (await this.checkRpc(rpc)) {
                    return rpc;
                }
            }catch(error){
                console.log('error:',error)
            }
        }
        return null;
    }

    // 获取余额
    async getBalance(address, rpc) {
        console.log('rpc:',rpc)
        let provider = new ethers.JsonRpcProvider(rpc);
        const balance = await provider.getBalance(address);
        //释放provider
        provider.destroy();
        return ethers.formatEther(balance);
    
    }

    // 计算转账需要的gas
    async estimateTransferGas(to, amount, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const gas = await provider.estimateGas({ to, value: ethers.parseEther(amount) });
        provider.destroy();
        return ethers.formatEther(gas);
    }

    // 获取erc20的信息
    async getErc20Info(address, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const erc20 = new ethers.Contract(address, this.ierc20Abi, provider);
        console.log('erc20:', erc20)
        const name = await erc20.name();
        const symbol = await erc20.symbol();
        const decimals = await erc20.decimals();
        provider.destroy();
        return {
            name,
            symbol,
            decimals,
        };
    }
    // 获取erc20的余额
    async getErc20Balance(address, erc20Address, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const erc20 = new ethers.Contract(erc20Address, this.ierc20Abi, provider);
        const balance = await erc20.balanceOf(address);
        const decimals = await erc20.decimals();
        provider.destroy();
        return ethers.formatUnits(balance, decimals);
    }

    // 计算erc20转账需要的gas
    async estimateErc20TransferGas(privateKey,erc20Address, to, amount, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const erc20 = new ethers.Contract(erc20Address, this.ierc20Abi, wallet);
        const decimals = await erc20.decimals();
        try{
            const gas = await erc20.transfer.estimateGas(to, ethers.parseUnits(amount.toString(), decimals));
            provider.destroy();
            return ethers.formatEther(gas);
        }catch(error){
            provider.destroy();
            return -1;
        }
            
    }
    // erc20转账
    async transferErc20(privateKey, erc20Address, to, amount, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const erc20 = new ethers.Contract(erc20Address, this.ierc20Abi, wallet);
        const decimals = await erc20.decimals();
        const tx = await erc20.transfer(to, ethers.parseUnits(amount.toString(), decimals));
        provider.destroy();
        return tx.hash;
    }
    // 转账
    async transfer(privateKey, to, amount, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const tx = await wallet.sendTransaction({ to, value: ethers.parseEther(amount.toString()) });
        provider.destroy();
        return tx.hash;
    }


}

export default Web3Manager;

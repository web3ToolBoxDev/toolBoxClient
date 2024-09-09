import { ethers } from 'ethers';
import network from './network.json';
import ierc20 from './IERC20Metadata.json';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import axios from 'axios';



const IRouter02Abi = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json');
const IPair02Abi = require('@uniswap/v2-core/build/IUniswapV2Pair.json');

const routerAddObj = {
    ETH: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    BSC: "0x10ED43C718714eb63d5aA57B78B54704E256024E"
}


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
    async getGasPrice(rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const gasPrice = (await provider.getFeeData()).gasPrice
        provider.destroy();
        return ethers.formatUnits(gasPrice, 'gwei');
    }
    calculateSwapGasFee(gasPrice, gasMultiplier) {
        const gasPriceBigInt = ethers.parseUnits(gasPrice, 'gwei');
        const gasLimitBigInt = 150000n;
        const scaleFactor = 10000n;
        const multiplier = ethers.toBigInt(Math.floor(gasMultiplier * 10000));
        return ethers.formatEther(gasPriceBigInt * gasLimitBigInt * multiplier / scaleFactor);
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
    getNetworkList(wantList = []) {
        const networkList = [];
        if (wantList.length > 0) {

            for (const networkName of wantList) {
                if (this.network[networkName]) {
                    networkList.push(networkName);
                }
            }
            return networkList;
        }
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
            } catch (error) {
                console.log('error:', error)
            }
        }
        return null;
    }

    // 获取余额
    async getBalance(address, rpc) {
        // console.log('rpc:', rpc)
        let provider = new ethers.JsonRpcProvider(rpc);
        const balance = await provider.getBalance(address);
        //释放provider
        provider.destroy();
        return ethers.formatEther(balance);

    }

    // 获取uniV2的信息
    async getUniV2Info(pairAddress, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        // 获取chainId
        const chainId = (await provider.getNetwork()).chainId;
        console.log('chainId:', chainId)
        let networkName = '';
        let nativeSymbol = '';
        if (chainId === 1n) {
            networkName = 'ETH';
            nativeSymbol = 'WETH';
        } else if (chainId === 56n) {
            networkName = 'BSC';
            nativeSymbol = 'WBNB';
        } else {
            return null;
        }

        const routerAddress = routerAddObj[networkName];
        const router = new ethers.Contract(routerAddress, IRouter02Abi.abi, provider);
        const WETH = await router.WETH();
        const pair = new ethers.Contract(pairAddress, IPair02Abi.abi, provider);
        const token0Address = await pair.token0();
        const token1Address = await pair.token1();
        const token0 = new ethers.Contract(token0Address, this.ierc20Abi, provider);
        const token1 = new ethers.Contract(token1Address, this.ierc20Abi, provider);
        const token0Symbol = await token0.symbol();
        const token1Symbol = await token1.symbol();
        const token0Decimals = await token0.decimals();
        const token1Decimals = await token1.decimals();
        const reserves = await pair.getReserves();
        const leftNative = token0Address === WETH;
        const rightNative = token1Address === WETH;
        return {
            rpc,
            chainId: chainId.toString(),
            networkName,
            nativeSymbol,
            leftNative,
            rightNative,
            pairAddress,
            leftTokenAddress: token0Address,
            rightTokenAddress: token1Address,
            leftTokenSymbol: token0Symbol,
            rightTokenSymbol: token1Symbol,
            leftTokenDecimals: token0Decimals.toString(),
            rightTokenDecimals: token1Decimals.toString(),
            leftTokenReserve: reserves[0].toString(),
            rightTokenReserve: reserves[1].toString(),
        }
    }
    // 获取uniV2reserve
    async getUniV2Reserve(pairAddress, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const pair = new ethers.Contract(pairAddress, IPair02Abi.abi, provider);
        const reserves = await pair.getReserves();
        provider.destroy();
        return {
            leftTokenReserve: reserves[0].toString(),
            rightTokenReserve: reserves[1].toString(),
        }
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
    async estimateErc20TransferGas(privateKey, erc20Address, to, amount, rpc) {
        let provider = new ethers.JsonRpcProvider(rpc);
        const wallet = new ethers.Wallet(privateKey, provider);
        const erc20 = new ethers.Contract(erc20Address, this.ierc20Abi, wallet);
        const decimals = await erc20.decimals();
        try {
            const gas = await erc20.transfer.estimateGas(to, ethers.parseUnits(amount.toString(), decimals));
            provider.destroy();
            return ethers.formatEther(gas);
        } catch (error) {
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

    getSwapAmount({
        inAmount,
        inDecimals,
        outDecimals,
        inReserve,
        outReserve,
    }) {
        //将输入string转换为BigNumber
        inReserve = ethers.toBigInt(inReserve);
        outReserve = ethers.toBigInt(outReserve);
        inDecimals = ethers.toBigInt(inDecimals);
        outDecimals = ethers.toBigInt(outDecimals);
        // Step 1: Parse input amount to include decimals.
        const inAmountWithDecimals = ethers.parseUnits(inAmount.toString(), inDecimals);

        // Step 2: Account for the 0.3% fee (997 / 1000).
        const inAmountWithDecimalsWithFee = inAmountWithDecimals * 997n;

        // Step 3: Apply the Uniswap V2 formula.
        const outAmountWithDecimals = inAmountWithDecimalsWithFee * outReserve / (inReserve * 1000n + inAmountWithDecimalsWithFee);

        // Step 4: Convert the output amount back to human-readable format with decimals.
        return ethers.formatUnits(outAmountWithDecimals, outDecimals);
    }
    async execPrivateSwapTask(taskList, gasMultiplier, callback) {
        if (taskList.length === 0) {
            return false;
        }

        console.log('taskList:', taskList);
        const rpc = taskList[0].rpc
        const provider = new ethers.JsonRpcProvider(rpc);

        let chainId = (await provider.getNetwork()).chainId;

        if (chainId !== 56n && chainId !== 1n) {
            return false;
        }
        const routerAddress = routerAddObj[chainId === 56n ? 'BSC' : 'ETH'];
        console.log('routerAddress:', routerAddress);
        const router = new ethers.Contract(routerAddress, IRouter02Abi.abi);

        const signed_txs = [];
        const curGasPrice = (await provider.getFeeData()).gasPrice;
        const gasPrice = curGasPrice * ethers.toBigInt(Math.floor(gasMultiplier * 10000)) / 10000n;
        const nonceRecord = {};
        const tx_hashes = [];
        for (let task of taskList) {

            const buyer = new ethers.Wallet(task.privateKey, provider);

            console.log('inAmount:', task.inAmount);
            console.log('outAmount:', task.outAmount);

            const inAmount = ethers.parseUnits(task.inAmount.toString(), ethers.toBigInt(task.inDecimals));
            const outAmount = ethers.parseUnits(task.outAmount.toString(), ethers.toBigInt(task.outDecimals));

            const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
            const path = [task.inAddress, task.outAddress];
            if (nonceRecord[buyer.address]) {
                nonceRecord[buyer.address] += 1;
            } else {
                nonceRecord[buyer.address] = await provider.getTransactionCount(buyer.address);
            }

            if (task.inNative) {

                const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens.populateTransaction(
                    outAmount,
                    path,
                    buyer.address,
                    deadline,
                    {
                        value: inAmount,
                        gasPrice,
                        gasLimit: 300000n,
                        chainId: chainId,
                        nonce: nonceRecord[buyer.address]
                    });
                const signed_tx = await buyer.signTransaction(tx);
                if (chainId === 1n) {
                    signed_txs.push({ signedTransaction: signed_tx });
                } else if (chainId === 56n) {
                    signed_txs.push(signed_tx);
                }
                const tx_hash = ethers.keccak256(signed_tx);
                callback({
                    type: 'log',
                    message: `创建交易hash:${tx_hash}`
                })
                tx_hashes.push(tx_hash);
            } else {
                //检查授权
                const erc20 = new ethers.Contract(task.inAddress, this.ierc20Abi, provider);
                const allowance = await erc20.allowance(buyer.address, routerAddress);
                if (allowance < inAmount) {
                    callback({
                        type: 'log',
                        message: `授权额度为${allowance},小于交易额度${inAmount},开始授权`
                    });
                    const tx = await erc20.approve.populateTransaction(routerAddress, ethers.MaxUint256, {
                        gasPrice,
                        gasLimit: 100000n,
                        chainId: chainId,
                        nonce: nonceRecord[buyer.address]
                    });
                    const signed_tx = await buyer.signTransaction(tx);
                    if (chainId === 1n) {
                        signed_txs.push({ signedTransaction: signed_tx });
                    } else if (chainId === 56n) {
                        signed_txs.push(signed_tx);
                    }
                    const tx_hash = ethers.keccak256(signed_tx);
                    callback({
                        type: 'log',
                        message: `创建授权交易hash:${tx_hash}`
                    })
                    tx_hashes.push(tx_hash);
                    nonceRecord[buyer.address] += 1;
                }
                if (task.outNative) {
                    const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens.populateTransaction(
                        inAmount,
                        outAmount,
                        path,
                        buyer.address,
                        deadline,
                        {
                            gasPrice,
                            gasLimit: 300000n,
                            chainId: chainId,
                            nonce: nonceRecord[buyer.address]
                        });
                    const signed_tx = await buyer.signTransaction(tx);
                    if (chainId === 1n) {
                        signed_txs.push({ signedTransaction: signed_tx });
                    } else if (chainId === 56n) {
                        signed_txs.push(signed_tx);
                    }
                    const tx_hash = ethers.keccak256(signed_tx);
                    callback({
                        type: 'log',
                        message: `创建交易hash:${tx_hash}`
                    })
                    tx_hashes.push(tx_hash);


                } else {
                    const tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens.populateTransaction(
                        inAmount,
                        outAmount,
                        path,
                        buyer.address,
                        deadline,
                        {
                            gasPrice,
                            gasLimit: 300000n,
                            chainId: chainId,
                            nonce: nonceRecord[buyer.address]
                        });
                    const signed_tx = await buyer.signTransaction(tx);
                    signed_txs.push({ signedTransaction: signed_tx });
                    if (chainId === 1n) {
                        signed_txs.push({ signedTransaction: signed_tx });
                    } else if (chainId === 56n) {
                        signed_txs.push(signed_tx);
                    }
                    const tx_hash = ethers.keccak256(signed_tx);
                    callback({
                        type: 'log',
                        message: `创建交易hash:${tx_hash}`
                    })
                    tx_hashes.push(tx_hash);

                }
            }
        }
        const blockNumber = await provider.getBlockNumber();
        const targetBlockNumber = blockNumber + 1;

        if (chainId === 1n) {
            console.log('signed_txs:', signed_txs);
            const signer = new ethers.Wallet(taskList[0].privateKey);
            const bundleProvider = await FlashbotsBundleProvider.create(provider, signer,
                "https://relay.flashbots.net",
                "mainnet");
            const signedTransactions = await bundleProvider.signBundle(signed_txs);
            const stimulationResponse = await bundleProvider.simulate(signedTransactions, targetBlockNumber, 'latest');
            console.log('Simulation response:', stimulationResponse);
            if (stimulationResponse.error) {
                callback({
                    type: 'error',
                    message: `Simulation failed: ${stimulationResponse.error.message}`
                });

                return false;
            }
            for (let tx of stimulationResponse.results) {
                if (tx.error) {
                    callback({
                        type: 'error',
                        message: `Simulation failed: ${tx.error}`
                    });
                    return false;
                }
            }
            const bundleResponse = await bundleProvider.sendRawBundle(signedTransactions, targetBlockNumber);
            const receipt = await bundleResponse.wait();
            if (receipt === 0) {
                callback({
                    type: 'success',
                    message: '交易成功'
                });
                return true;
            } else {
                callback({
                    type: 'error',
                    message: '交易失败,请提高gas倍数重试'
                });

                return false;
            }
        } else if (chainId === 56n) {
            const mevRpc = 'https://blockrazor-builder-tokyo.48.club';

            const blockNumber = await provider.getBlockNumber();
            const targetBlockNumber = blockNumber + 2;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': '3AiDl3jTC4KOqlSAuPG8p7QSx3S3nnV8Q5GbrmzyeXFdbOXCmrbQiEJbhCoy3KogSIeq5pgjoPAnSEJypYCMdRP8F4YjWfde'
            }
            const requestData = {
                jsonrpc: "2.0",
                id: "1",
                method: "eth_sendBundle",
                params: [
                    {
                        txs: signed_txs, // 经签名的raw transaction列表
                        maxBlockNumber: targetBlockNumber, // 该bundle有效的最大区块号
                        revertingTxHashes: tx_hashes, // 该bundle中所有交易的hash列表
                    }
                ]
            };
            const response = await axios.post(mevRpc, requestData, { headers });
            console.log('Response:', response.data);
            if (response.data.error) {
                callback({
                    type: 'error',
                    message: `Bundle failed: ${response.data.error.message}`
                });
                return false;
            }
            const receiptPromise = provider.waitForTransaction(tx_hashes[0]);

            const blockExceedPromise = new Promise((_, reject) => {
                const interval = setInterval(async () => {
                    const currentBlock = await provider.getBlockNumber();
                    if (currentBlock - 1 > targetBlockNumber) {
                        clearInterval(interval);
                        reject(new Error('Target block number exceeded before transaction was confirmed.'));
                    }
                }, 1000); // Check every second
            });
            try {
                await Promise.race([receiptPromise, blockExceedPromise]);
                //检查所有交易是否成功
                for (let tx_hash of tx_hashes) {
                    const receipt = await provider.getTransactionReceipt(tx_hash);
                    console.log('receipt:', receipt);
                    if (!receipt.status) {
                        callback({
                            type: 'error',
                            message: `交易hash：${tx_hash}失败，请检查币种是否含税，含税请调高滑点`
                        });
                        return false;
                    }
                }
            } catch (error) {
                callback({
                    type: 'error',
                    message: '交易失败，请提高gas倍数重试'
                });
                return false;
            }
            callback({
                type: 'success',
                message: '交易成功'
            });
            return true;
        }
    }

}




export default Web3Manager;

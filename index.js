require('dotenv').config();
const Web3 = require('web3');
const PepeCoinABI = require('./PepeCoinABI.json');
const EthDater = require('ethereum-block-by-date');
const abiDecoder = require('abi-decoder'); // Import abi-decoder

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_API_KEY));
const contractAddress = process.env.MEME_COIN_CONTRACT_ADDRESS.toLowerCase();
const minAmount = web3.utils.toBN(process.env.MINIMUM_AMOUNT);
const ethDater = new EthDater(web3);

const contract = new web3.eth.Contract(PepeCoinABI, contractAddress);

// Initialize abi-decoder with your contract's ABI
abiDecoder.addABI(PepeCoinABI);

async function scanTransactions() {
    const startDate = new Date('2023-04-01');
    const endDate = new Date('2023-04-30');

    const blocksInRange = await ethDater.getEvery(
        'days',
        startDate,
        endDate,
        1,
        true,
        false
    );

    for (const blockInfo of blocksInRange) {
        console.log(`Scanning block ${blockInfo.block} - Date: ${blockInfo.date}`);
        const block = await web3.eth.getBlock(blockInfo.block, true);

        for (const transaction of block.transactions) {
            if (transaction.to && transaction.to.toLowerCase() === contractAddress) {
                try {
                    const receipt = await web3.eth.getTransactionReceipt(transaction.hash);
                    for (const log of receipt.logs) {
                        if (log.address.toLowerCase() === contractAddress) {
                            const decodedLogs = abiDecoder.decodeLogs([log]);

                            if (decodedLogs && decodedLogs.length > 0) {
                                const decodedLog = decodedLogs[0];
                                const decodedValue = web3.utils.toBN(decodedLog.events[2].value);

                                if (decodedValue.gte(minAmount)) {
                                    console.log('Significant transaction found:', {
                                        from: decodedLog.events[0].value,
                                        to: decodedLog.events[1].value,
                                        value: decodedValue.toString(),
                                        transactionHash: transaction.hash
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing transaction:', error);
                }
            }
        }
    }

    console.log('Scanning complete.');
}

scanTransactions().catch(console.error);

const Web3 = require('web3');
const abiDecoder = require('abi-decoder'); // Import ABI decoder
const fs = require('fs');

const contractAddress = '0x6982508145454ce325ddbe47a25d4ec3d2311933'; // Your contract address
const infuraApiKey = '8dadf78004a044cdb0184994fbc60984'; // Your Infura API key
const pepeCoinABIPath = './PepeCoinABI.json'; // Path to your ABI file
const maxTransactionCount = 10000; // Maximum transaction count

// Initialize web3 with Infura
const web3 = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${infuraApiKey}`));

// Load and use ABI from file
const pepeCoinABI = JSON.parse(fs.readFileSync(pepeCoinABIPath, 'utf8'));
abiDecoder.addABI(pepeCoinABI);

async function findBiggestTransfers() {
    try {
        const blockRangeStart = parseInt('17350899'); // Decimal start block
        const blockRangeEnd = parseInt('17786898'); // Decimal end block
        let transfers = [];

        console.log(`Processing from block ${blockRangeStart} to ${blockRangeEnd}`);

        let fromBlock = blockRangeStart;
        const batchSize = 1000; // Query in batches of 1,000 blocks

        while (fromBlock <= blockRangeEnd) {
            const toBlock = Math.min(fromBlock + batchSize - 1, blockRangeEnd);
            console.log(`Fetching logs from block ${fromBlock} to ${toBlock}`);

            const logs = await web3.eth.getPastLogs({
                fromBlock: web3.utils.toHex(fromBlock),
                toBlock: web3.utils.toHex(toBlock),
                address: contractAddress
            });

            console.log(`Fetched ${logs.length} logs`);
            
            // Wrap the forEach loop in an async function
            await Promise.all(logs.map(async (log) => {
                const decodedLogs = abiDecoder.decodeLogs([log]);
                for (const decodedLog of decodedLogs) {
                    if (decodedLog && decodedLog.name === "Transfer") {
                        const toAddress = decodedLog.events.find(e => e.name === 'to').value;
                        
                        // Check the transaction count of the address
                        const transactionCount = await web3.eth.getTransactionCount(toAddress);
                        
                        if (transactionCount <= maxTransactionCount) {
                            const valueInWei = decodedLog.events.find(e => e.name === 'value').value;
                            const valueInEther = web3.utils.fromWei(valueInWei, 'ether');
                            transfers.push({ address: toAddress, amount: valueInEther, txHash: log.transactionHash });
                        }
                    }
                }
            }));

            fromBlock = toBlock + 1;
        }

        // Sort transfers by amount and get top 50
        const topTransfers = transfers.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)).slice(0, 50);

        console.log("Top 50 transfers:");
        topTransfers.forEach((transfer, index) => {
            console.log(`#${index + 1}: ${transfer.amount} Ether to ${transfer.address} (Tx Hash: ${transfer.txHash})`);
        });

        console.log("Scan complete");
    } catch (error) {
        console.error('Error:', error);
    }
}

findBiggestTransfers();


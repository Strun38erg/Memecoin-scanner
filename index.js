require('dotenv').config();
const Web3 = require('web3');

console.log(`Connecting to Infura: ${process.env.INFURA_API_KEY}`);
// Connect to the Ethereum node using the Infura API key from .env
const web3 = new Web3(`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`);

// Read the contract address, minimum Ether amount, and dates from .env
const contractAddress = process.env.CONTRACT_ADDRESS;
const minimumEtherAmount = web3.utils.toWei(process.env.MINIMUM_ETHER_AMOUNT, 'ether');
const startDate = new Date(process.env.START_DATE).getTime() / 1000;
const endDate = new Date(process.env.END_DATE).getTime() / 1000;

// Function to scan transactions on the contract within a specific timeframe
async function scanContractTransactionsInTimeframe() {
  try {
    // Get the latest block number
    const latestBlockNumber = await web3.eth.getBlockNumber();

    // Loop through blocks within the specified timeframe
    for (let blockNumber = latestBlockNumber; blockNumber >= 0; blockNumber--) {
      const block = await web3.eth.getBlock(blockNumber, true);

      // Check if the block timestamp is within the specified timeframe
      if (block.timestamp >= startDate && block.timestamp <= endDate) {
        for (const transaction of block.transactions) {
          // Check if the transaction is to the contract and meets the minimum amount
          if (transaction.to === contractAddress && transaction.value >= minimumEtherAmount) {
            // Log the address that initiated (bought) in the transaction
            console.log('Buying Address:', transaction.from);
            console.log('Value:', web3.utils.fromWei(transaction.value, 'ether'), 'ETH');
          }
        }
      }

      // Break the loop if we've gone before the specified timeframe
      if (block.timestamp < startDate) {
        break;
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Call the function to scan transactions
scanContractTransactionsInTimeframe();

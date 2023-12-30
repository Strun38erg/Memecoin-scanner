const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// Define the Uniswap GraphQL API endpoint URL and Etherscan API key
const apiURL = process.env.UNISWAP_API_URL;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;

// Timestamps for April 27, 2023 to April 29, 2023
const startDateTimestamp = Math.floor(new Date('2023-04-01').getTime() / 1000);
const endDateTimestamp = Math.floor(new Date('2023-04-29').getTime() / 1000);

// Function to fetch swaps with pagination
async function fetchSwaps(skip = 0) {
    const query = `
        query MyQuery {
            swaps(
                where: {
                    amount1_gt: 0,
                    amountUSD_gte: 500,
                    token0: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
                    timestamp_gte: ${startDateTimestamp},
                    timestamp_lte: ${endDateTimestamp}
                }
                first: 1000
                skip: ${skip}
            ) {
                amount0
                amount1
                amountUSD
                sender
                recipient
                timestamp
                id
            }
        }
    `;

    try {
        const response = await axios.post(apiURL, { query });
        return response.data.data.swaps;
    } catch (error) {
        console.error('Error fetching swaps:', error);
        throw error;
    }
}

// Function to fetch transaction count from Etherscan
async function getTransactionCount(walletAddress) {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${etherscanApiKey}`;

    console.log(`Fetching transaction count for wallet: ${walletAddress}`);
    try {
        const response = await axios.get(url);
        console.log(`Transactions for wallet ${walletAddress}: ${response.data.result.length}`);
        return response.data.result.length;
    } catch (error) {
        console.error('Error fetching transaction count:', error.message);
        return -1;  // Indicates an error
    }
}

// Function to check if a wallet address is a contract
async function isContract(walletAddress) {
    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${walletAddress}&apikey=${etherscanApiKey}`;

    try {
        const response = await axios.get(url);
        if (response.data.status === "1" && response.data.result.length > 0) {
            const contractInfo = response.data.result[0];
            return contractInfo.ContractName !== '' || contractInfo.ABI !== 'Contract source code not verified';
        }
        return false;
    } catch (error) {
        console.error('Error checking if address is a contract:', error.message);
        return false;
    }
}

// Function to check if a wallet address has a public tag on Etherscan
async function hasPublicTag(walletAddress) {
    const url = `https://api.etherscan.io/api?module=account&action=getaddressinfo&address=${walletAddress}&apikey=${etherscanApiKey}`;

    try {
        const response = await axios.get(url);
        return response.data.status === "1" && response.data.result.tag;
    } catch (error) {
        console.error('Error checking if address has a public tag:', error.message);
        return false;
    }
}

// Utility function to delay execution
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to calculate and display ETA
function displayETA(totalBatches, currentBatch, startTime) {
    const currentTime = new Date().getTime();
    const elapsedTime = (currentTime - startTime) / 1000; // seconds
    const averageTimePerBatch = elapsedTime / currentBatch;
    const remainingBatches = totalBatches - currentBatch;
    const remainingTime = averageTimePerBatch * remainingBatches; // in seconds

    const remainingMinutes = Math.floor(remainingTime / 60);
    const remainingSeconds = Math.floor(remainingTime % 60);

    console.log(`ETA: ${remainingMinutes} minutes and ${remainingSeconds} seconds remaining`);
}

// Process and display data with filtering
async function processAndDisplayData() {
  let totalProcessedTxs = 0;  // Counter for the processed transactions
  let skip = 0;
  let allSwaps = [];

  // Fetch and process in batches
  while (true) {
      const swaps = await fetchSwaps(skip);
      if (swaps.length === 0) break;
      allSwaps = allSwaps.concat(swaps);
      skip += swaps.length;
  }

  let walletData = {};
  const walletAddresses = Array.from(new Set(allSwaps.map(swap => swap.recipient)));
  const totalBatches = Math.ceil(walletAddresses.length / 4);
  const startTime = new Date().getTime(); // Record start time

  console.log(`Processing swaps with filtering... Total swaps found: ${allSwaps.length}`);

  // Process in batches
  const batchSize = 4; // corresponds to rate limit
  for (let i = 0; i < walletAddresses.length; i += batchSize) {
      const batch = walletAddresses.slice(i, i + batchSize);
      try {
          await Promise.all(batch.map(async (wallet) => {
              try {
                  const isContractAddress = await isContract(wallet);
                  const hasTag = await hasPublicTag(wallet);
                  if (!isContractAddress && !hasTag) {
                      const txCount = await getTransactionCount(wallet);
                      if (txCount <= 10000) {
                          const walletSwaps = allSwaps.filter(swap => swap.recipient === wallet);
                          walletSwaps.forEach(swap => {
                              if (!walletData[wallet]) {
                                  walletData[wallet] = {
                                      totalAmountUSD: 0,
                                      totalTokenAmount: 0,
                                      firstPurchaseTimestamp: Number.MAX_VALUE,
                                      count: 0,
                                      transactionIDs: [] // Initialize an array to store transaction IDs
                                  };
                              }
                              walletData[wallet].totalAmountUSD += parseFloat(swap.amountUSD);
                              walletData[wallet].totalTokenAmount += parseFloat(swap.amount0);
                              walletData[wallet].firstPurchaseTimestamp = Math.min(walletData[wallet].firstPurchaseTimestamp, swap.timestamp);
                              walletData[wallet].count += 1;
                              walletData[wallet].transactionIDs.push(swap.id); // Add transaction ID to the array
                              totalProcessedTxs += 1;
                          });
                      } else {
                          console.log(`Skipping wallet ${wallet} with ${txCount} transactions (more than threshold)`);
                      }
                  } else {
                      console.log(`Skipping wallet ${wallet} (Contract: ${isContractAddress}, Has Public Tag: ${hasTag})`);
                  }
              } catch (batchError) {
                  console.error(`Error processing wallet ${wallet}:`, batchError);
              }
          }));
      } catch (batchError) {
          console.error(`Error processing batch ${i / batchSize}:`, batchError);
      }

      if (i + batchSize < walletAddresses.length) {
          console.log(`Processed batch ${Math.ceil(i/batchSize) + 1} of ${totalBatches}`);
          displayETA(totalBatches, Math.ceil(i/batchSize) + 1, startTime);
          await delay(1000); // delay for 1 second (1000 milliseconds)
      }
  }

  console.log("Finished processing. Saving data to walletData.json");

  try {
      const filePath = './walletData.json';
      fs.writeFileSync(filePath, JSON.stringify(walletData, null, 2));
      console.log(`Wallet data saved to ${filePath}`);
  } catch (error) {
      console.error('Error saving data to walletData.json:', error);
  }

  console.log(`Total processed transactions: ${totalProcessedTxs}`);
}

// Run the main function
processAndDisplayData();
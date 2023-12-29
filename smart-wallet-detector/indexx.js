const axios = require('axios');
require('dotenv').config();

// Define the Uniswap GraphQL API endpoint URL and Etherscan API key
const apiURL = process.env.UNISWAP_API_URL;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY;

// Define the GraphQL query for swap transactions
const query = `
  query MyQuery {
    swaps(
      where: {
        amountUSD_gte: 2000,
        token0: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
        timestamp_gte: 1679875200,
        timestamp_lte: 1682265600
      }
      first: 2000
    ) {
      amount0
      amount1
      amountUSD
      sender
      recipient
    }
  }
`;

// Fetch data from the GraphQL API
async function fetchData() {
  console.log("Fetching data from Uniswap...");
  try {
    const response = await axios.post(apiURL, { query });
    console.log("Received response from Uniswap");
    if (response.data.data && response.data.data.swaps) {
      console.log(`Found ${response.data.data.swaps.length} swaps`);
      return response.data.data.swaps;
    } else {
      console.error('Swaps data not found or query error:', response.data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching data from Uniswap:', error);
    throw error; // Re-throw the error to handle it in the calling function
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

// Utility function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to check if a wallet address is a contract
async function isContract(walletAddress) {
  const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${walletAddress}&apikey=${etherscanApiKey}`;

  try {
    const response = await axios.get(url);
    if (response.data.status === "1" && response.data.result.length > 0) {
      const contractInfo = response.data.result[0];
      // Check for specific fields that indicate a contract
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
    // Check if the response indicates it has a tag
    return response.data.status === "1" && response.data.result.tag;
  } catch (error) {
    console.error('Error checking if address has a public tag:', error.message);
    return false;
  }
}

// Process and display the data with filtering
async function processAndDisplayData() {
  let totalProcessedTxs = 0;  // Counter for the processed transactions
  
  try {
    const swaps = await fetchData();
    let walletData = {};

    // Gather recipient addresses
    const walletAddresses = Array.from(new Set(swaps.map(swap => swap.recipient)));

    console.log(`Processing swaps with filtering... Total swaps found: ${swaps.length}`);

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
              if (txCount <= 10000) { // Adjust this threshold as needed
                // Filter swaps based on recipient
                const walletSwaps = swaps.filter(swap => swap.recipient === wallet);
                walletSwaps.forEach(swap => {
                  if (!walletData[wallet]) {
                    walletData[wallet] = { totalAmountUSD: 0, count: 0 };
                  }
                  walletData[wallet].totalAmountUSD += parseFloat(swap.amountUSD);
                  walletData[wallet].count += 1;
                  totalProcessedTxs += 1;  // Increment the processed transactions counter
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
        console.log(`Processed batch ${i/batchSize + 1}, waiting for next batch...`);
        await delay(2000); // delay for 1 second (1000 milliseconds)
      }
    }

    console.log("Finished processing. Displaying sorted data:");
    const sortedData = Object.entries(walletData).map(([wallet, data]) => ({
      wallet,
      ...data
    })).sort((a, b) => b.totalAmountUSD - a.totalAmountUSD);

    sortedData.forEach(({ wallet, totalAmountUSD, count }) => {
      console.log(`Wallet: ${wallet}, Total USD Amount: $${totalAmountUSD.toFixed(2)}, Transactions: ${count}`);
    });

    console.log(`Total processed transactions: ${totalProcessedTxs}`);  // Log the total processed transactions
  } catch (error) {
    console.error('Error during processing and displaying data:', error);
  }
}

// Run the main function
processAndDisplayData();

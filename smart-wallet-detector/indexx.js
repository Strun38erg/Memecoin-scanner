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
        amountUSD_gte: 1500,
        token0: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
        timestamp_gte: 1682467200,
        timestamp_lte: 1682812799
      }
      first: 10000
    ) {
      amount0
      amount1
      amountUSD
      sender
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
    console.error('Error fetching data from Uniswap:', error.message);
    return [];
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
    // Check if the response indicates it's a contract
    return response.data.status === "1" && response.data.result.length > 0;
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
  const swaps = await fetchData();

  let walletData = {};
  const walletAddresses = Array.from(new Set(swaps.map(swap => swap.sender)));

  console.log("Processing swaps with filtering...");

  // Process in batches
  const batchSize = 4; // corresponds to rate limit
  for (let i = 0; i < walletAddresses.length; i += batchSize) {
    const batch = walletAddresses.slice(i, i + batchSize);

    await Promise.all(batch.map(async (wallet) => {
      const isContractAddress = await isContract(wallet);
      const hasTag = await hasPublicTag(wallet);

      // Check if it's a contract or has a public tag
      if (isContractAddress || hasTag) {
        console.log(`Skipping wallet ${wallet} (Contract: ${isContractAddress}, Has Public Tag: ${hasTag})`);
        return; // Skip this wallet
      }

      const txCount = await getTransactionCount(wallet);

      // Check for more than 10,000 transactions
      if (txCount > 10000) {
        console.log(`Skipping wallet ${wallet} with ${txCount} transactions`);
        return; // Skip this wallet
      }

      swaps.filter(swap => swap.sender === wallet).forEach(swap => {
        if (!walletData[wallet]) {
          walletData[wallet] = { totalAmountUSD: 0, count: 0 };
        }
        walletData[wallet].totalAmountUSD += parseFloat(swap.amountUSD);
        walletData[wallet].count += 1;
      });
    }));

    if (i + batchSize < walletAddresses.length) {
      console.log(`Processed batch ${i/batchSize + 1}, waiting for next batch...`);
      await delay(1000); // delay for 1 second (1000 milliseconds)
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
}

processAndDisplayData();

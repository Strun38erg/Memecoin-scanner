const axios = require('axios');

// Define the Uniswap GraphQL API endpoint URL
const apiURL = 'https://subgraph.satsuma-prod.com/465969e86ac6/strunes-team--2153034/community/uniswap-v3/version/v3/api';

// Define the GraphQL query for swap transactions
const query = `
query MyQuery {
  swaps(
    where: {
      amountUSD_gte: 500,
      token0: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      timestamp_gte: 1682467200,
      timestamp_lte: 1682812799
    }
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
  try {
    const response = await axios.post(apiURL, { query });
    if (response.data.data && response.data.data.swaps) {
      return response.data.data.swaps;
    } else {
      console.error('Swaps data not found or query error:', response.data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching data:', error.message);
    return [];
  }
}

// Process and display the data
async function processAndDisplayData() {
  const swaps = await fetchData();

  let walletData = {};

  swaps.forEach(swap => {
    const wallet = swap.sender;
    if (!walletData[wallet]) {
      walletData[wallet] = { totalAmountUSD: 0, count: 0 };
    }
    walletData[wallet].totalAmountUSD += parseFloat(swap.amountUSD);
    walletData[wallet].count += 1;
  });

  // Convert the object to an array and sort by totalAmountUSD
  const sortedData = Object.entries(walletData).map(([wallet, data]) => ({
    wallet,
    ...data
  })).sort((a, b) => b.totalAmountUSD - a.totalAmountUSD);

  // Display the data
  sortedData.forEach(({ wallet, totalAmountUSD, count }) => {
    console.log(`Wallet: ${wallet}, Total USD Amount: $${totalAmountUSD.toFixed(2)}, Transactions: ${count}`);
  });
}

// Execute the data processing function
processAndDisplayData();

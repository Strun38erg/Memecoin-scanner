require('dotenv').config();
console.log(`ETH Price from .env: ${process.env.ETH_PRICE}`);
const fs = require('fs');
const axios = require('axios');

const REQUEST_INTERVAL = 3000;

function readJsonFile(filePath) {
    console.log(`Reading data from ${filePath}...`);
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
}

function calculateProfitAndROI(wallet, buyData, sellData) {
    const totalBuyUSD = buyData[wallet]?.totalAmountUSD || 0;
    const totalSellUSD = sellData[wallet]?.totalAmountUSD || 0;
    const profit = totalSellUSD - totalBuyUSD;
    const roi = totalBuyUSD > 0 ? (profit / totalBuyUSD) * 100 : 0;
    return { profit, roi };
}

function displayETA(startTime, currentIndex, totalLength) {
    const currentTime = new Date().getTime();
    const elapsedTime = currentTime - startTime; // time in milliseconds
    const averageTimePerWallet = elapsedTime / currentIndex;
    const estimatedTotalTime = averageTimePerWallet * totalLength;
    const remainingTime = estimatedTotalTime - elapsedTime;
    const remainingSeconds = Math.floor(remainingTime / 1000) % 60;
    const remainingMinutes = Math.floor(remainingTime / 60000);
    console.log(`ETA: Approximately ${remainingMinutes} minutes and ${remainingSeconds} seconds remaining`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getWalletBalanceInUSD(walletAddress) {
    const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
    try {
        await delay(REQUEST_INTERVAL);
        const url = `https://api.etherscan.io/api?module=account&action=balance&address=${walletAddress}&tag=latest&apikey=${etherscanApiKey}`;
        const response = await axios.get(url);

        console.log(`Etherscan response for wallet ${walletAddress}:`, response.data);

        if (response.data.status !== '1') {
            console.error(`Error or no data for wallet ${walletAddress}:`, response.data.message);
            return null;
        }

        const balanceWei = response.data.result;
        console.log(`Balance in Wei for wallet ${walletAddress}:`, balanceWei);

        const balanceEth = balanceWei / 1e18; // Convert Wei to ETH
        console.log(`Balance in ETH for wallet ${walletAddress}:`, balanceEth);

        const ethPriceInUSD = getCurrentEthPriceInUSD();
        console.log(`Current ETH price in USD:`, ethPriceInUSD);

        const balanceUSD = balanceEth * ethPriceInUSD;
        console.log(`Balance in USD for wallet ${walletAddress}:`, balanceUSD);

        return balanceUSD;
    } catch (error) {
        console.error(`Error fetching wallet balance for ${walletAddress}:`, error);
        return null;
    }
}

function getCurrentEthPriceInUSD() {
    const ethPriceInUSD = process.env.ETH_PRICE || '0'; // Default to '0' if not set
    console.log(`ETH price from .env: ${ethPriceInUSD}`); // Debugging log
    return parseFloat(ethPriceInUSD);
}

async function processWalletData() {
    console.log("Starting data processing...");

    try {
        const buyData = readJsonFile('walletBuydata.json');
        const sellData = readJsonFile('walletSelldata.json');
        let resultData = {};
        const startTime = new Date().getTime();
        const walletAddresses = Object.keys(buyData);
        const totalWallets = walletAddresses.length;

        for (let index = 0; index < totalWallets; index++) {
            const wallet = walletAddresses[index];
            if (!buyData.hasOwnProperty(wallet) || !sellData.hasOwnProperty(wallet)) {
                console.log(`Skipping wallet: ${wallet} as it does not exist in both buy and sell data.`);
                continue;
            }

            const balanceUSD = await getWalletBalanceInUSD(wallet);
            const { profit, roi } = calculateProfitAndROI(wallet, buyData, sellData);

            resultData[wallet] = {
                balanceUSD,
                profit,
                roi: roi.toFixed(2),
                buyTransactions: buyData[wallet].transactionIDs,
                sellTransactions: sellData[wallet].transactionIDs
            };

            if (index % 10 === 0 || index === totalWallets - 1) {
                console.log(`Processed ${index + 1}/${totalWallets} wallets...`);
                displayETA(startTime, index + 1, totalWallets);
            }
        }

        // Sorting logic: first by balance, then by ROI
        const sortedData = Object.fromEntries(
            Object.entries(resultData).sort(([, a], [, b]) => b.balanceUSD - a.balanceUSD || b.roi - a.roi)
        );

        fs.writeFileSync('walletProfitROIdata.json', JSON.stringify(sortedData, null, 2));
        console.log('Data processed and saved to walletProfitROIdata.json');
    } catch (error) {
        console.error('Error during processing:', error);
    }
}

processWalletData();

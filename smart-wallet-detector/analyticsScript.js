const fs = require('fs');

function readJsonFile(filePath) {
    console.log(`Reading data from ${filePath}...`);
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
}

function calculateProfitAndROI(wallet, buyData, sellData) {
    const totalBuyUSD = buyData[wallet].totalAmountUSD || 0;
    const totalSellUSD = sellData[wallet].totalAmountUSD || 0;
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

function processWalletData() {
    console.log("Starting data processing...");

    try {
        const buyData = readJsonFile('walletBuydata.json');
        const sellData = readJsonFile('walletSelldata.json');
        let resultData = {};
        const startTime = new Date().getTime();
        const walletAddresses = Object.keys(buyData);
        const totalWallets = walletAddresses.length;

        walletAddresses.forEach((wallet, index) => {
            if (sellData.hasOwnProperty(wallet)) {
                const { profit, roi } = calculateProfitAndROI(wallet, buyData, sellData);
                resultData[wallet] = {
                    profit,
                    roi: roi.toFixed(2),
                    buyTransactions: buyData[wallet].transactionIDs,
                    sellTransactions: sellData[wallet].transactionIDs
                };
            }

            if (index % 10 === 0 || index === totalWallets - 1) {
                console.log(`Processed ${index + 1}/${totalWallets} wallets...`);
                displayETA(startTime, index + 1, totalWallets);
            }
        });

        // Sorting the resultData by ROI in descending order
        const sortedData = Object.fromEntries(
            Object.entries(resultData).sort(([, a], [, b]) => b.roi - a.roi)
        );

        fs.writeFileSync('walletProfitROIdata.json', JSON.stringify(sortedData, null, 2));
        console.log('Data processed and saved to walletProfitROIdata.json');
    } catch (error) {
        console.error('Error during processing:', error);
    }
}

processWalletData();

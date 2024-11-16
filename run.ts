import fs from "fs";
const { ethers } = require("ethers");

async function fetchAllBlocks() {
  const provider = new ethers.JsonRpcProvider(
    "https://mainnet.infura.io/v3/f5f5ed1413be46c6b638522f733c460a"
  );

  const filePath = "/tmp/block_timestamps.json";
  let data: Record<number, string> = {};
  let startBlock = 0;

  // Load existing data
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    data = JSON.parse(fileContent);
    const processedBlocks = Object.keys(data).map(Number);
    if (processedBlocks.length > 0) {
      startBlock = Math.max(...processedBlocks) + 1;
      console.log(`Resuming from block: ${startBlock}`);
    }
  } else {
    console.log("Starting from block 0.");
  }

  const latestBlockNumber = await provider.getBlockNumber();
  console.log(`Latest Block Number: ${latestBlockNumber}`);

  // Batch size and rate limits
  const batchSize = 10; // Adjust based on your Infura rate limits
  const concurrencyLimit = 5; // Maximum concurrent batches
  const sleepDuration = 1000; // Milliseconds to wait between batch starts if needed

  // Helper function to delay execution
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Function to process a batch of blocks
  const processBatch = async (start: number, end: number): Promise<[number, string][]> => {
    const promises = [];
    for (let blockNumber = start; blockNumber <= end; blockNumber++) {
      promises.push(
        provider.getBlock(blockNumber).then((block) => {
          const timestamp = new Date(block.timestamp * 1000).toISOString();
          console.log(`Fetched Block: ${blockNumber}, Timestamp: ${timestamp}`);
          return [blockNumber, timestamp];
        }).catch((error) => {
          console.error(`Failed to fetch block ${blockNumber}:`, error);
          return null; // Ensure the promise resolves even on error
        })
      );
    }
    const results = await Promise.all(promises);
    return results.filter((result) => result !== null) as [number, string][];
  };

  // Process blocks in batches with limited concurrency
  for (let i = startBlock; i <= latestBlockNumber; i += batchSize * concurrencyLimit) {
    const batchPromises = [];
    for (let j = 0; j < concurrencyLimit && i + j * batchSize <= latestBlockNumber; j++) {
      const batchStart = i + j * batchSize;
      const batchEnd = Math.min(batchStart + batchSize - 1, latestBlockNumber);
      batchPromises.push(processBatch(batchStart, batchEnd));
    }

    // Wait for all batches to complete and sort results
    const batchResults = await Promise.all(batchPromises);
    const sortedResults = batchResults
      .flat() // Flatten the array of arrays
      .sort(([a], [b]) => a - b); // Sort by block number

    // Write sorted results to file sequentially
    for (const [blockNumber, timestamp] of sortedResults) {
      data[blockNumber] = timestamp;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    await sleep(sleepDuration); // Adjust the sleep duration based on your rate limits
  }

  console.log("Finished fetching all blocks.");
}

fetchAllBlocks().catch(console.error);

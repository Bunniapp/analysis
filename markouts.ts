import { request, gql } from 'graphql-request';
import { BigNumber } from 'bignumber.js';
import * as fs from 'fs';
import * as path from 'path';
import asciichart from 'asciichart';

interface Currency {
    id: string;
    symbol: string;
}

interface Pool {
    id: string;
    currency0: Currency;
    currency1: Currency;
    creationTimestamp: string;
}

interface Swap {
    id: string;
    timestamp: string;
    zeroForOne: boolean;
    inputAmount: string;
    outputAmount: string;
    rawBalance0: string;
    rawBalance1: string;
    reserve0: string;
    reserve1: string;
    pricePerVaultShare0: string;
    pricePerVaultShare1: string;
}

interface PriceData {
    [token: string]: {
        [timestamp: number]: number;
    };
}

interface BatchHistoricalResponse {
    coins: {
        [key: string]: {
            symbol: string;
            prices: Array<{
                timestamp: number;
                price: number;
                confidence?: number;
            }>;
        };
    };
}

interface MarkoutDatapoint {
    date: string;
    swapCount: number;
    delta0: BigNumber;
    delta1: BigNumber;
    price0: BigNumber;
    price1: BigNumber;
    markout: BigNumber;
    cumulative: BigNumber;
    tvlAdjustedMarkout: BigNumber; // Daily TVL-adjusted markout
    cumulativeTvlAdjusted: BigNumber; // Cumulative TVL-adjusted markout
}

interface CachedResults {
    poolId: string;
    network: string;
    poolSymbols: {
        currency0: string;
        currency1: string;
    };
    swapCount: number;
    lastTimestamp: string; // Last processed swap timestamp
    markouts: MarkoutDatapoint[];
    prices?: {
        token0Id: string;
        token1Id: string;
        data: PriceData;
    };
}

// Parse command line arguments
const args = process.argv.slice(2);
let poolId = '';
let network = 'mainnet';
let debug = false;

for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--pool' || args[i] === '-p') && i + 1 < args.length) {
        poolId = args[i + 1];
        i++;
    } else if ((args[i] === '--network' || args[i] === '-n') && i + 1 < args.length) {
        network = args[i + 1];
        i++;
    } else if (args[i] === '--debug' || args[i] === '-d') {
        debug = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
        console.log(`
Usage: bun run markout.ts --pool <poolId> [--network <network>] [--debug]

Options:
  --pool, -p     Pool ID (address)
  --network, -n  Network to query (default: mainnet)
  --debug, -d    Show debug information
  --help, -h     Show help
    `);
        process.exit(0);
    }
}

if (!poolId) {
    console.error('Error: Pool ID is required. Use --pool <poolId>');
    process.exit(1);
}

// Network endpoints
const SUBGRAPH_ENDPOINTS: Record<string, string> = {
    mainnet: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-mainnet/api`,
    arbitrum: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-arbitrum/api`,
    base: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-base/api`,
    sepolia: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-sepolia/api`,
    unichain: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-unichain/api`
};

const CHAIN_NAMES: Record<string, string> = {
    mainnet: 'ethereum',
    arbitrum: 'arbitrum',
    base: 'base',
    sepolia: 'sepolia',
    unichain: 'unichain'
};

const endpoint = SUBGRAPH_ENDPOINTS[network] || SUBGRAPH_ENDPOINTS.mainnet;
const chainName = CHAIN_NAMES[network] || 'ethereum';

// Cache setup - Just a single file for markout results
const CACHE_DIR = path.join(process.cwd(), '.cache');
const MARKOUTS_CACHE_FILE = path.join(CACHE_DIR, `markouts_${network}_${poolId}.json`);

// Create cache directory if it doesn't exist
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// GraphQL queries
const POOL_QUERY = gql`
  query GetPool($poolId: ID!) {
    pool(id: $poolId) {
      id
      currency0 {
        id
        symbol
      }
      currency1 {
        id
        symbol
      }
      creationTimestamp
    }
  }
`;

const SWAPS_QUERY = gql`
  query GetSwaps($poolId: ID!, $skip: Int!, $startTime: Int!, $endTime: Int!) {
    swaps(
      first: 1000,
      skip: $skip,
      where: {
        pool: $poolId,
        timestamp_gt: $startTime,
        timestamp_lt: $endTime
      },
      orderBy: timestamp,
      orderDirection: asc
    ) {
      id
      timestamp
      zeroForOne
      inputAmount
      outputAmount
      rawBalance0
      rawBalance1
      reserve0
      reserve1
      pricePerVaultShare0
      pricePerVaultShare1
    }
  }
`;

// Read cache
function readCache(): CachedResults | null {
    try {
        if (fs.existsSync(MARKOUTS_CACHE_FILE)) {
            // Read the JSON file and parse with BigNumber revival
            const fileContent = fs.readFileSync(MARKOUTS_CACHE_FILE, 'utf8');
            const data = JSON.parse(fileContent, (key, value) => {
                if (key === 'delta0' || key === 'delta1' || key === 'price0' || key === 'price1' ||
                    key === 'markout' || key === 'cumulative' || key === 'tvlAdjustedMarkout' ||
                    key === 'cumulativeTvlAdjusted') {
                    return new BigNumber(value);
                }
                return value;
            });

            // Validate the structure matches CachedResults
            if (
                typeof data === 'object' &&
                data !== null &&
                typeof data.poolId === 'string' &&
                typeof data.network === 'string' &&
                typeof data.poolSymbols === 'object' &&
                typeof data.poolSymbols.currency0 === 'string' &&
                typeof data.poolSymbols.currency1 === 'string' &&
                typeof data.swapCount === 'number' &&
                // Check for lastTimestamp (might be missing in older cache files)
                (data.lastTimestamp === undefined || typeof data.lastTimestamp === 'string') &&
                Array.isArray(data.markouts) &&
                data.markouts.every((m: any) => (
                    typeof m.date === 'string' &&
                    typeof m.swapCount === 'number' &&
                    m.delta0 instanceof BigNumber &&
                    m.delta1 instanceof BigNumber &&
                    m.price0 instanceof BigNumber &&
                    m.price1 instanceof BigNumber &&
                    m.markout instanceof BigNumber &&
                    m.cumulative instanceof BigNumber &&
                    (m.tvlAdjustedMarkout === undefined || m.tvlAdjustedMarkout instanceof BigNumber) &&
                    (m.cumulativeTvlAdjusted === undefined || m.cumulativeTvlAdjusted instanceof BigNumber)
                )) &&
                // Validate prices structure if it exists
                (data.prices === undefined ||
                    (typeof data.prices === 'object' &&
                        typeof data.prices.token0Id === 'string' &&
                        typeof data.prices.token1Id === 'string' &&
                        typeof data.prices.data === 'object'))
            ) {
                return data as CachedResults;
            }

            console.warn('Cache file format is invalid');
            return null;
        }
    } catch (error) {
        console.warn(`Warning: Failed to read cache file ${MARKOUTS_CACHE_FILE}`, error);
    }
    return null;
}

// Write cache
function writeCache(data: CachedResults): void {
    try {
        const serializedData = JSON.stringify(data);

        fs.writeFileSync(MARKOUTS_CACHE_FILE, serializedData, 'utf8');
    } catch (error) {
        console.warn(`Warning: Failed to write cache file ${MARKOUTS_CACHE_FILE}`, error);
    }
}

// Format date from timestamp
function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString().split('T')[0];
}

// Get day timestamp from full timestamp (start of day)
function getDayTimestamp(timestamp: number): number {
    return Math.floor(timestamp / 86400) * 86400;
}

// Find the closest timestamp divisible by 86400 (start of day)
function findClosestDayTimestamp(timestamp: number): number {
    const dayInSeconds = 86400;
    // Get the day timestamp (start of day)
    const dayStart = getDayTimestamp(timestamp);
    // Get the next day timestamp
    const nextDayStart = dayStart + dayInSeconds;

    // Determine which is closer: start of day or start of next day
    if (timestamp - dayStart < nextDayStart - timestamp) {
        return dayStart; // Closer to start of day
    } else {
        return nextDayStart; // Closer to start of next day
    }
}

// Get pool info
async function getPoolInfo(poolId: string): Promise<Pool> {
    console.log(`Fetching pool info for: ${poolId} on ${network}...`);

    const { pool } = await request<{ pool: Pool }>(endpoint, POOL_QUERY, {
        poolId: poolId.toLowerCase()
    });

    if (!pool) throw new Error(`Pool with ID ${poolId} not found on ${network}`);

    return pool;
}

// Get all swaps for a pool, starting from a specific timestamp
async function getAllSwaps(poolId: string, startTime: number = 0): Promise<Swap[]> {
    console.log(`Fetching swaps from timestamp ${startTime}...`);

    const swaps: Swap[] = [];
    let skip = 0;

    const endTime = Math.floor(Date.now() / 1000 / 86400) * 86400; // don't need today's data
    console.log(`Fetching swaps until timestamp ${endTime}...`);

    while (true) {
        const data = await request<{ swaps: Swap[] }>(endpoint, SWAPS_QUERY, {
            poolId: poolId.toLowerCase(),
            skip,
            startTime,
            endTime
        });

        const batch = data.swaps;
        swaps.push(...batch);

        if (batch.length < 1000) break;
        skip += 1000;
        process.stdout.write(`\rFetched ${swaps.length} swaps...`);
    }

    console.log(`\nFound ${swaps.length} swaps since timestamp ${startTime}`);
    return swaps;
}

// Get token prices using the batchHistorical endpoint with batching to avoid URL length limits
async function getPrices(token0: string, token1: string, timestamps: number[]): Promise<PriceData> {
    const uniqueTimestamps = [...new Set(timestamps)];

    // Create a map to store prices by timestamp
    const prices: PriceData = {
        [token0]: {},
        [token1]: {}
    };

    console.log(`\nFetching prices for ${uniqueTimestamps.length} unique timestamps using batchHistorical endpoint...`);

    // Batch size for timestamps to avoid URL length limits
    // A smaller batch size helps prevent HTTP 414 errors (URI Too Long)
    const BATCH_SIZE = 100; // Adjust this value if needed

    // Process timestamps in batches
    for (let i = 0; i < uniqueTimestamps.length; i += BATCH_SIZE) {
        const timestampBatch = uniqueTimestamps.slice(i, i + BATCH_SIZE);

        process.stdout.write(`\rFetching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueTimestamps.length / BATCH_SIZE)}...`);

        try {
            // Create the coins object for the batchHistorical endpoint
            const coinsObj: Record<string, number[]> = {
                [`${chainName}:${token0}`]: timestampBatch,
                [`${chainName}:${token1}`]: timestampBatch
            };

            // Convert to JSON string for the query parameter
            const coinsParam = JSON.stringify(coinsObj);

            // Construct the URL
            const baseUrl = process.env.DEFILLAMA_API_KEY
                ? `https://pro-api.llama.fi/${process.env.DEFILLAMA_API_KEY}/coins/batchHistorical`
                : `https://coins.llama.fi/coins/batchHistorical`;

            const url = new URL(baseUrl);
            url.searchParams.append('coins', coinsParam);
            url.searchParams.append('searchWidth', '6h'); // Default search width

            // Make an API call for this batch of timestamps
            const response = await fetch(url.toString());
            if (!response.ok) throw new Error(`API error: ${response.status} - ${await response.text()}`);

            const data = await response.json() as BatchHistoricalResponse;

            // Process the response
            const coin0Key = `${chainName}:${token0}`;
            const coin1Key = `${chainName}:${token1}`;

            if (data.coins[coin0Key]) {
                data.coins[coin0Key].prices.forEach((priceData: { timestamp: number; price: number }) => {
                    // Find the closest timestamp divisible by 86400 (start of day)
                    const dayTimestamp = findClosestDayTimestamp(priceData.timestamp);
                    // Store all prices for the current session (zero or not)
                    prices[token0][dayTimestamp] = priceData.price || 0;
                });
            }

            if (data.coins[coin1Key]) {
                data.coins[coin1Key].prices.forEach((priceData: { timestamp: number; price: number }) => {
                    // Find the closest timestamp divisible by 86400 (start of day)
                    const dayTimestamp = findClosestDayTimestamp(priceData.timestamp);
                    // Store all prices for the current session (zero or not)
                    prices[token1][dayTimestamp] = priceData.price || 0;
                });
            }

            // Small delay to avoid rate limiting
            if (i + BATCH_SIZE < uniqueTimestamps.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error(`\nError fetching batch prices (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${(error as Error).message}`);
            // Set timestamps in this batch to 0 for the current session
            timestampBatch.forEach(timestamp => {
                // Find the closest day timestamp
                const dayTimestamp = findClosestDayTimestamp(timestamp);
                // Only set to 0 if not already in the prices object (to avoid overwriting valid cached prices)
                if (prices[token0][dayTimestamp] === undefined) {
                    prices[token0][dayTimestamp] = 0;
                }
                if (prices[token1][dayTimestamp] === undefined) {
                    prices[token1][dayTimestamp] = 0;
                }
            });
        }
    }

    // Check if we got all the timestamps (using closest day timestamps)
    const missingTimestamps0 = uniqueTimestamps.filter(ts => {
        const dayTimestamp = findClosestDayTimestamp(ts);
        return prices[token0][dayTimestamp] === undefined;
    });
    const missingTimestamps1 = uniqueTimestamps.filter(ts => {
        const dayTimestamp = findClosestDayTimestamp(ts);
        return prices[token1][dayTimestamp] === undefined;
    });

    if (missingTimestamps0.length > 0 || missingTimestamps1.length > 0) {
        console.log(`\nWarning: Missing prices for some timestamps:`);
        console.log(`  Token0 (${token0}): ${missingTimestamps0.length} missing timestamps`);
        console.log(`  Token1 (${token1}): ${missingTimestamps1.length} missing timestamps`);

        // Set missing timestamps to 0 for the current session
        missingTimestamps0.forEach(ts => {
            // Find the closest day timestamp
            const dayTimestamp = findClosestDayTimestamp(ts);
            prices[token0][dayTimestamp] = 0;
        });
        missingTimestamps1.forEach(ts => {
            // Find the closest day timestamp
            const dayTimestamp = findClosestDayTimestamp(ts);
            prices[token1][dayTimestamp] = 0;
        });
    }

    console.log('\nPrice data fetched');
    return prices;
}

// Process swaps and calculate markouts in a single pass
function processSwapsAndCalculateMarkouts(
    swaps: Swap[],
    pool: Pool,
    prices: PriceData
): MarkoutDatapoint[] {
    console.log('\nProcessing swaps and calculating markouts...');

    const dayInSeconds = 86400;
    const dailyData: Record<number, {
        date: string,
        swapCount: number,
        delta0: BigNumber,
        delta1: BigNumber,
        tvlAdjustedMarkout: BigNumber
    }> = {};

    // Process each swap and group by day
    swaps.forEach((swap: Swap) => {
        const swapTimestamp = parseInt(swap.timestamp);
        const dayTs = getDayTimestamp(swapTimestamp);
        const dateStr = formatDate(dayTs);
        const eodTimestamp = dayTs + dayInSeconds; // End of day timestamp

        // Initialize day if not exists
        if (!dailyData[dayTs]) {
            dailyData[dayTs] = {
                date: dateStr,
                swapCount: 0,
                delta0: new BigNumber(0),
                delta1: new BigNumber(0),
                tvlAdjustedMarkout: new BigNumber(0)
            };
        }

        // Update day metrics
        const day = dailyData[dayTs];
        day.swapCount++;

        // Calculate delta based on swap direction
        const isZeroForOne = swap.zeroForOne; // true if selling token0 for token1

        // For consistent calculation:
        // - token0 balance increases when someone sells token0 for token1 (delta0 positive)
        // - token1 balance increases when someone sells token1 for token0 (delta1 positive)
        if (isZeroForOne) {
            // Swapper selling token0 for token1
            // Pool got token0 and lost token1
            day.delta0 = day.delta0.plus(new BigNumber(swap.inputAmount));
            day.delta1 = day.delta1.minus(new BigNumber(swap.outputAmount));
        } else {
            // Swapper selling token1 for token0
            // Pool got token1 and lost token0
            day.delta0 = day.delta0.minus(new BigNumber(swap.outputAmount));
            day.delta1 = day.delta1.plus(new BigNumber(swap.inputAmount));
        }

        // Calculate TVL and TVL-adjusted markout for this swap
        try {
            // Get token prices at the end of the day (EOD)
            const price0EODUSD = new BigNumber(prices[pool.currency0.id][eodTimestamp] || 0);
            const price1EODUSD = new BigNumber(prices[pool.currency1.id][eodTimestamp] || 0);

            if (price0EODUSD.isGreaterThan(0) && price1EODUSD.isGreaterThan(0)) {
                // Calculate TVL using the formula with EOD prices:
                // TVL = (rawBalance0 + reserve0 * pricePerVaultShare0) * price0USD +
                //       (rawBalance1 + reserve1 * pricePerVaultShare1) * price1USD
                const rawBalance0 = new BigNumber(swap.rawBalance0);
                const rawBalance1 = new BigNumber(swap.rawBalance1);
                const reserve0 = new BigNumber(swap.reserve0);
                const reserve1 = new BigNumber(swap.reserve1);
                const pricePerVaultShare0 = new BigNumber(swap.pricePerVaultShare0);
                const pricePerVaultShare1 = new BigNumber(swap.pricePerVaultShare1);

                const token0Value = rawBalance0.plus(reserve0.times(pricePerVaultShare0)).times(price0EODUSD);
                const token1Value = rawBalance1.plus(reserve1.times(pricePerVaultShare1)).times(price1EODUSD);
                const tvl = token0Value.plus(token1Value);

                // Calculate markout for this specific swap using EOD prices
                let swapDelta0;
                let swapDelta1;

                if (isZeroForOne) {
                    swapDelta0 = new BigNumber(swap.inputAmount);
                    swapDelta1 = new BigNumber(swap.outputAmount).negated();
                } else {
                    swapDelta0 = new BigNumber(swap.outputAmount).negated();
                    swapDelta1 = new BigNumber(swap.inputAmount);
                }

                // Use EOD prices for markout calculation
                const swapMarkout = swapDelta0.times(price0EODUSD).plus(swapDelta1.times(price1EODUSD));

                // Calculate TVL-adjusted markout (markout / tvl) and accumulate
                if (tvl.isGreaterThan(0)) {
                    const tvlAdjustedMarkoutForSwap = swapMarkout.dividedBy(tvl);
                    day.tvlAdjustedMarkout = day.tvlAdjustedMarkout.plus(tvlAdjustedMarkoutForSwap);
                }
            }
        } catch (error) {
            console.warn(`Warning: Could not calculate TVL for swap ${swap.id}: ${(error as Error).message}`);
        }
    });

    // Convert daily data to array and sort by timestamp
    const dailyChanges = Object.entries(dailyData)
        .map(([timestamp, data]) => ({ timestamp: parseInt(timestamp), ...data }))
        .sort((a, b) => a.timestamp - b.timestamp);

    // Calculate markouts and cumulative values
    const markouts: MarkoutDatapoint[] = [];
    let cumulative = new BigNumber(0);
    let cumulativeTvlAdjusted = new BigNumber(0);

    for (const day of dailyChanges) {
        // Get EOD timestamp
        const eodTimestamp = day.timestamp + dayInSeconds;

        // Get EOD prices
        const price0 = new BigNumber(prices[pool.currency0.id][eodTimestamp] || 0);
        const price1 = new BigNumber(prices[pool.currency1.id][eodTimestamp] || 0);

        // Calculate daily markout using EOD prices
        const dailyMarkout = day.delta0.times(price0).plus(day.delta1.times(price1));

        // Update cumulative values
        cumulative = cumulative.plus(dailyMarkout);
        cumulativeTvlAdjusted = cumulativeTvlAdjusted.plus(day.tvlAdjustedMarkout);

        // Create markout datapoint
        markouts.push({
            date: day.date,
            swapCount: day.swapCount,
            delta0: day.delta0,
            delta1: day.delta1,
            price0,
            price1,
            markout: dailyMarkout,
            cumulative,
            tvlAdjustedMarkout: day.tvlAdjustedMarkout,
            cumulativeTvlAdjusted
        });
    }

    return markouts;
}

// Print markout results
function displayMarkouts(markouts: MarkoutDatapoint[], currency0Symbol: string, currency1Symbol: string): void {
    if (currency0Symbol === 'Native Currency') currency0Symbol = 'ETH';

    console.log('\nDaily Markout Results using EOD price:');
    console.log('-'.repeat(140)); // Wider to accommodate TVL-adjusted columns
    console.log(
        'Date'.padEnd(12),
        'Swaps'.padEnd(8),
        `Δ ${currency0Symbol}`.padEnd(15),
        `Δ ${currency1Symbol}`.padEnd(15),
        'Price 0'.padEnd(8),
        'Price 1'.padEnd(8),
        'Daily Markout ($)'.padEnd(15),
        'Cum Markout ($)'.padEnd(15),
        'TVL-Adj Markout'.padEnd(15),
        'Cum TVL-Adj Markout'.padEnd(15)
    );
    console.log('-'.repeat(140));

    markouts.forEach(m => {
        console.log(
            m.date.padEnd(12),
            m.swapCount.toString().padEnd(8),
            m.delta0.toFixed(6).padEnd(15),
            m.delta1.toFixed(6).padEnd(15),
            `$${m.price0.toFixed(2)}`.padEnd(10),
            `$${m.price1.toFixed(2)}`.padEnd(10),
            `$${m.markout.toFixed(2)}`.padEnd(15),
            `$${m.cumulative.toFixed(2)}`.padEnd(15),
            `${m.tvlAdjustedMarkout.times(100).toFixed(6)}%`.padEnd(15),
            `${m.cumulativeTvlAdjusted.times(100).toFixed(6)}%`.padEnd(15)
        );
    });

    // Add charts after the table
    displayCharts(markouts);

    // Summary
    const lastMarkout = markouts[markouts.length - 1];
    console.log('\nSummary:');
    console.log(`Pool: ${currency0Symbol}/${currency1Symbol}`);
    console.log(`Total days with swap activity: ${markouts.length}`);
    console.log(`Final cumulative markout: $${lastMarkout.cumulative.toFixed(2)}`);
    console.log(`Final cumulative TVL-adjusted markout: ${lastMarkout.cumulativeTvlAdjusted.times(100).toFixed(6)}%`);
}

// Add this function to generate charts
function displayCharts(markouts: MarkoutDatapoint[]): void {
    // Prepare data series
    const cumulativeMarkouts = markouts.map(m => m.cumulative.toNumber());
    const cumulativeTvlAdjusted = markouts.map(m => m.cumulativeTvlAdjusted.times(100).toNumber());

    // Configuration for regular markout chart
    const markoutConfig = {
        height: 20,
        colors: [asciichart.blue],
    };

    // Generate regular markout chart
    console.log('\nCumulative Markout Performance Chart ($):');
    console.log(asciichart.plot([cumulativeMarkouts], markoutConfig));

    // Configuration for TVL-adjusted markout chart
    const tvlAdjustedConfig = {
        height: 20,
        colors: [asciichart.green],
    };

    // Generate TVL-adjusted markout chart
    console.log('\nCumulative TVL-Adjusted Markout Performance Chart (%):');
    console.log(asciichart.plot([cumulativeTvlAdjusted], tvlAdjustedConfig));
}

// Main function
async function calculateMarkouts(poolId: string): Promise<void> {
    try {
        console.log(`Running markout calculator for pool ${poolId} on ${network}`);

        // Read cache to get existing data
        const cachedResults = readCache();
        let startTime = 0;

        // Check if we have valid cached data for this pool and network
        const hasCachedData = cachedResults &&
            cachedResults.poolId === poolId &&
            cachedResults.network === network;

        if (hasCachedData) {
            console.log('Found cached data, will fetch only new swaps...');

            // Get the last processed timestamp to use as our starting point
            if (cachedResults.lastTimestamp) {
                startTime = parseInt(cachedResults.lastTimestamp);
                console.log(`Will fetch swaps after timestamp ${startTime} (${new Date(startTime * 1000).toISOString()})`);
            } else {
                console.log('No lastTimestamp found in cache, will fetch all swaps');
            }
        } else {
            console.log('No valid cached results found, calculating markouts from scratch');
        }

        // Fetch pool info
        const pool = await getPoolInfo(poolId);

        // Show token info if debug mode
        if (debug) {
            console.log(`\nToken Information:`);
            console.log(`Token 0: ${pool.currency0.symbol} (ID: ${pool.currency0.id})`);
            console.log(`Token 1: ${pool.currency1.symbol} (ID: ${pool.currency1.id})`);
        }

        // Fetch new swaps since the last processed timestamp
        const newSwaps = await getAllSwaps(poolId, startTime);

        // If no new swaps and no cached data, nothing to do
        if (newSwaps.length === 0 && !hasCachedData) {
            console.log('No swaps found for this pool.');
            return;
        }

        // If no new swaps but we have cached data, just display the cached results
        if (newSwaps.length === 0 && hasCachedData) {
            console.log('No new swaps found since last update. Using cached markouts.');
            displayMarkouts(
                cachedResults.markouts,
                pool.currency0.symbol,
                pool.currency1.symbol
            );
            console.log(`\nTotal swaps processed: ${cachedResults.swapCount}`);
            console.log(`Cache file: ${MARKOUTS_CACHE_FILE}`);
            return;
        }

        // Get the latest timestamp from the new swaps for caching
        const latestTimestamp = newSwaps.length > 0 ?
            newSwaps[newSwaps.length - 1].timestamp :
            startTime.toString();

        // Calculate total swap count (cached + new)
        const totalSwapCount = hasCachedData ?
            cachedResults.swapCount + newSwaps.length :
            newSwaps.length;

        // Show first few swaps in debug mode
        if (debug && newSwaps.length > 0) {
            console.log(`\nSample Swap Data (First 3):`);
            newSwaps.slice(0, 3).forEach((swap: Swap, i: number) => {
                console.log(`Swap ${i + 1}:`);
                console.log(`  Direction: ${swap.zeroForOne ? 'Zero For One' : 'One For Zero'}`);
                console.log(`  Input Amount: ${swap.inputAmount}`);
                console.log(`  Output Amount: ${swap.outputAmount}`);
                console.log(`  Raw Balance0: ${swap.rawBalance0}`);
                console.log(`  Raw Balance1: ${swap.rawBalance1}`);
                console.log(`  Reserve0: ${swap.reserve0}`);
                console.log(`  Reserve1: ${swap.reserve1}`);
                console.log(`  PricePerVaultShare0: ${swap.pricePerVaultShare0}`);
                console.log(`  PricePerVaultShare1: ${swap.pricePerVaultShare1}`);
            });
        }

        // Define day in seconds constant
        const dayInSeconds = 86400;

        // Initialize prices data structure
        let prices: PriceData = {
            [pool.currency0.id]: {},
            [pool.currency1.id]: {}
        };

        // Get all timestamps we need prices for
        const allTimestamps: number[] = [];
        newSwaps.forEach((swap: Swap) => {
            const dayTs = getDayTimestamp(parseInt(swap.timestamp));
            allTimestamps.push(dayTs + dayInSeconds);
        });
        const uniqueTimestamps = [...new Set(allTimestamps)];

        // Check if we have cached prices and use them
        let timestampsToFetch: number[] = uniqueTimestamps;

        if (cachedResults && cachedResults.prices &&
            cachedResults.prices.token0Id === pool.currency0.id &&
            cachedResults.prices.token1Id === pool.currency1.id) {
            console.log('Found cached price data');

            // Copy cached prices to our prices object
            const cachedPrices = cachedResults.prices.data;
            prices[pool.currency0.id] = { ...cachedPrices[pool.currency0.id] };
            prices[pool.currency1.id] = { ...cachedPrices[pool.currency1.id] };

            // Filter out timestamps that are already in the cache
            timestampsToFetch = uniqueTimestamps.filter(timestamp => {
                const hasToken0Price = prices[pool.currency0.id][timestamp] !== undefined;
                const hasToken1Price = prices[pool.currency1.id][timestamp] !== undefined;
                return !(hasToken0Price && hasToken1Price);
            });

            console.log(`Using ${uniqueTimestamps.length - timestampsToFetch.length} cached timestamps, need to fetch ${timestampsToFetch.length} new timestamps`);
        }

        // Fetch only the timestamps that aren't in the cache
        if (timestampsToFetch.length > 0) {
            console.log('Fetching missing price data from DeFiLlama...');

            // Get prices only for timestamps not in cache
            const newPrices = await getPrices(
                pool.currency0.id,
                pool.currency1.id,
                timestampsToFetch
            );

            // Merge new prices with cached prices
            Object.entries(newPrices[pool.currency0.id]).forEach(([timestampStr, price]) => {
                const timestamp = parseInt(timestampStr);
                // Find the closest day timestamp
                const dayTimestamp = findClosestDayTimestamp(timestamp);
                prices[pool.currency0.id][dayTimestamp] = price;
            });

            Object.entries(newPrices[pool.currency1.id]).forEach(([timestampStr, price]) => {
                const timestamp = parseInt(timestampStr);
                // Find the closest day timestamp
                const dayTimestamp = findClosestDayTimestamp(timestamp);
                prices[pool.currency1.id][dayTimestamp] = price;
            });
        } else if (uniqueTimestamps.length > 0) {
            console.log('All required prices found in cache, no need to fetch from DeFiLlama');
        }

        // Process swaps and calculate markouts in a single pass
        // Only process the new swaps
        const newMarkouts = processSwapsAndCalculateMarkouts(newSwaps, pool, prices);

        // Merge with cached markouts if available
        let combinedMarkouts = newMarkouts;
        if (hasCachedData && cachedResults.markouts && cachedResults.markouts.length > 0) {
            console.log(`Merging ${cachedResults.markouts.length} cached markouts with ${newMarkouts.length} new markouts...`);
            // Create a map of dates to markouts for easy lookup and merging
            const markoutsByDate = new Map<string, MarkoutDatapoint>();

            // Add cached markouts to the map
            cachedResults.markouts.forEach(markout => {
                markoutsByDate.set(markout.date, markout);
            });

            // Add or update with new markouts
            newMarkouts.forEach(markout => {
                markoutsByDate.set(markout.date, markout);
            });

            // Convert back to array and sort by date
            combinedMarkouts = Array.from(markoutsByDate.values())
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            console.log(`Combined markouts: ${combinedMarkouts.length}`);
        } else {
            console.log(`Using only new markouts: ${newMarkouts.length}`);
        }

        // Create a filtered version of prices that excludes zero values for caching
        const pricesToCache: PriceData = {
            [pool.currency0.id]: {},
            [pool.currency1.id]: {}
        };

        // Only include non-zero prices in the cache
        Object.entries(prices[pool.currency0.id]).forEach(([timestampStr, price]) => {
            const timestamp = parseInt(timestampStr);
            // We don't need to find closest day timestamp here since the keys in prices
            // should already be aligned to day timestamps from previous processing
            if (price > 0) {
                pricesToCache[pool.currency0.id][timestamp] = price;
            }
        });

        Object.entries(prices[pool.currency1.id]).forEach(([timestampStr, price]) => {
            const timestamp = parseInt(timestampStr);
            // We don't need to find closest day timestamp here since the keys in prices
            // should already be aligned to day timestamps from previous processing
            if (price > 0) {
                pricesToCache[pool.currency1.id][timestamp] = price;
            }
        });

        // Cache the final results with filtered prices
        const resultsToCache: CachedResults = {
            poolId,
            network,
            poolSymbols: {
                currency0: pool.currency0.symbol,
                currency1: pool.currency1.symbol
            },
            swapCount: totalSwapCount,
            lastTimestamp: latestTimestamp,
            // Store the combined markouts in the cache
            markouts: combinedMarkouts,
            prices: {
                token0Id: pool.currency0.id,
                token1Id: pool.currency1.id,
                data: pricesToCache
            }
        };

        writeCache(resultsToCache);

        // Display results
        displayMarkouts(combinedMarkouts, pool.currency0.symbol, pool.currency1.symbol);

        console.log(`\nTotal swaps processed: ${totalSwapCount}`);
        console.log(`New swaps processed: ${newSwaps.length}`);
        console.log(`Results cached to: ${MARKOUTS_CACHE_FILE}`);

    } catch (error) {
        console.error('Error:', (error as Error).message);
    }
}

calculateMarkouts(poolId);

import { request, gql } from 'graphql-request';
import { BigNumber } from 'bignumber.js';
import * as fs from 'fs';
import * as path from 'path';
import * as asciichart from 'asciichart';

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

interface UniPool {
    id: string;
    token0: {
        id: string;
        symbol: string;
    };
    token1: {
        id: string;
        symbol: string;
    };
    createdAtTimestamp: string;
}

interface UniSwap {
    id: string;
    timestamp: string;
    amount0: string; // Signed integer, positive means pool gained token0
    amount1: string; // Signed integer, positive means pool gained token1
}

interface UniPoolHourData {
    periodStartUnix: string;
    tvlUSD: string;
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
    cumulative?: BigNumber; // Optional - will be calculated at runtime
    tvlAdjustedMarkout: BigNumber; // Daily TVL-adjusted markout
    cumulativeTvlAdjusted?: BigNumber; // Optional - will be calculated at runtime
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
let bunniPoolId = '';
let uniPoolId = '';
let network = 'mainnet';
let debug = false;

type UniswapPoolType = 'Uniswap' | 'Aerodrome';
let uniswapPoolType: UniswapPoolType = 'Uniswap';

for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--pool' || args[i] === '-p') && i + 1 < args.length) {
        bunniPoolId = args[i + 1];
        i++;
    } else if ((args[i] === '--network' || args[i] === '-n') && i + 1 < args.length) {
        network = args[i + 1];
        i++;
    } else if (args[i] === '--debug' || args[i] === '-d') {
        debug = true;
    } else if ((args[i] === '--aerodrome' || args[i] === '-a') && i + 1 < args.length) {
        uniPoolId = args[i + 1].toLowerCase();
        uniswapPoolType = 'Aerodrome';
        i++;
    } else if ((args[i] === '--uniswap' || args[i] === '-u') && i + 1 < args.length) {
        uniPoolId = args[i + 1].toLowerCase();
        uniswapPoolType = 'Uniswap';
        i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
        console.log(`
Usage: bun run markout.ts --pool <bunniPoolId> [--uniswap <uniPoolId>] [--aerodrome <aeroPoolId>] [--network <network>] [--debug]

Options:
  --pool, -p         Bunni Pool ID
  --uniswap, -u      Uniswap Pool address
  --aerodrome, -a    Aerodrome Pool address
  --network, -n      Network to query for Bunni/Uniswap pool (default: mainnet)
  --debug, -d        Show debug information
  --help, -h         Show help
    `);
        process.exit(0);
    }
}

if (!bunniPoolId) {
    console.error('Error: Bunni Pool ID is required. Use --pool <bunniPoolId>');
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

const UNISWAP_SUBGRAPH_ENDPOINTS: Record<string, string> = {
    base: `https://gateway.thegraph.com/api/${process.env.THE_GRAPH_API_KEY}/subgraphs/id/HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1`,
    mainnet: `https://gateway.thegraph.com/api/${process.env.THE_GRAPH_API_KEY}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`,
};

// Aerodrome subgraph endpoint
const AERO_SUBGRAPH_ENDPOINT = `https://gateway.thegraph.com/api/${process.env.THE_GRAPH_API_KEY}/subgraphs/id/GENunSHWLBXm59mBSgPzQ8metBEp9YDfdqwFr91Av1UM`;

const CHAIN_NAMES: Record<string, string> = {
    mainnet: 'ethereum',
    arbitrum: 'arbitrum',
    base: 'base',
    sepolia: 'sepolia',
    unichain: 'unichain'
};

const endpoint = SUBGRAPH_ENDPOINTS[network] || SUBGRAPH_ENDPOINTS.mainnet;
const uniEndpoint = uniswapPoolType === 'Uniswap' ? UNISWAP_SUBGRAPH_ENDPOINTS[network] : AERO_SUBGRAPH_ENDPOINT;
const chainName = CHAIN_NAMES[network] || 'ethereum';

// Cache setup - Just a single file for markout results
const CACHE_DIR = path.join(process.cwd(), '.cache');
const getBunniCacheFile = (id: string, net: string) => {
    return path.join(CACHE_DIR, `markouts_${net}_${id}.json`);
};
const getUniCacheFile = (id: string) => {
    return path.join(CACHE_DIR, `markouts_uniswap_${id}.json`);
};

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

const UNI_POOL_QUERY = gql`
  query GetUniPool($poolId: ID!) {
    pool(id: $poolId) {
      id
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
      createdAtTimestamp
    }
  }
`;

const UNI_SWAPS_QUERY = gql`
  query GetUniSwaps($poolId: ID!, $skip: Int!, $startTime: Int!, $endTime: Int!) {
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
      amount0
      amount1
    }
  }
`;

// Note: We're using a custom query in getUniPoolHourData function instead of a predefined one

// Read cache
function readCache(cacheFile: string): CachedResults | null {
    if (!cacheFile) return null;

    try {
        if (fs.existsSync(cacheFile)) {
            // Read the JSON file and parse with BigNumber revival
            const fileContent = fs.readFileSync(cacheFile, 'utf8');
            const data = JSON.parse(fileContent, (key, value) => {
                if (key === 'delta0' || key === 'delta1' || key === 'price0' || key === 'price1' ||
                    key === 'markout' || key === 'tvlAdjustedMarkout'
                ) {
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
                    (m.tvlAdjustedMarkout === undefined || m.tvlAdjustedMarkout instanceof BigNumber)
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
        console.warn(`Warning: Failed to read cache file ${cacheFile}`, error);
    }
    return null;
}

// Write cache
function writeCache(data: CachedResults, cacheFile: string): void {
    if (!cacheFile) return;

    try {
        const serializedData = JSON.stringify(data);

        fs.writeFileSync(cacheFile, serializedData, 'utf8');
    } catch (error) {
        console.warn(`Warning: Failed to write cache file ${cacheFile}`, error);
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
async function getAllSwaps(poolId: string, startTime: number = 0, customEndTime?: number): Promise<Swap[]> {
    console.log(`Fetching swaps from timestamp ${startTime}...`);

    const swaps: Swap[] = [];
    let skip = 0;

    // Use custom end time if provided, otherwise use today's start (don't need today's data)
    const endTime = customEndTime || Math.floor(Date.now() / 1000 / 86400) * 86400;
    console.log(`Fetching swaps until timestamp ${endTime} (${new Date(endTime * 1000).toISOString()})...`);

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

    // Calculate markouts without cumulative values (will be calculated at runtime when needed)
    const markouts: MarkoutDatapoint[] = [];

    for (const day of dailyChanges) {
        // Get EOD timestamp
        const eodTimestamp = day.timestamp + dayInSeconds;

        // Get EOD prices
        const price0 = new BigNumber(prices[pool.currency0.id][eodTimestamp] || 0);
        const price1 = new BigNumber(prices[pool.currency1.id][eodTimestamp] || 0);

        // Calculate daily markout using EOD prices
        const dailyMarkout = day.delta0.times(price0).plus(day.delta1.times(price1));

        // Create markout datapoint without cumulative values
        markouts.push({
            date: day.date,
            swapCount: day.swapCount,
            delta0: day.delta0,
            delta1: day.delta1,
            price0,
            price1,
            markout: dailyMarkout,
            tvlAdjustedMarkout: day.tvlAdjustedMarkout
        });
    }

    return markouts;
}

// Print markout results
function displayMarkouts(markouts: MarkoutDatapoint[], currency0Symbol: string, currency1Symbol: string): void {
    if (currency0Symbol === 'Native Currency') currency0Symbol = 'ETH';

    // Calculate cumulative values at runtime
    let cumulativeMarkout = new BigNumber(0);
    let cumulativeTvlAdjusted = new BigNumber(0);

    // Add cumulative values to each markout
    const marksWithCumulative = markouts.map(m => {
        cumulativeMarkout = cumulativeMarkout.plus(m.markout);
        cumulativeTvlAdjusted = cumulativeTvlAdjusted.plus(m.tvlAdjustedMarkout);

        return {
            ...m,
            cumulative: cumulativeMarkout,
            cumulativeTvlAdjusted: cumulativeTvlAdjusted
        };
    });

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

    marksWithCumulative.forEach(m => {
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

    // Summary
    const lastMarkout = marksWithCumulative[marksWithCumulative.length - 1];
    console.log('\nSummary:');
    console.log(`Pool: ${currency0Symbol}/${currency1Symbol}`);
    console.log(`Total days with swap activity: ${markouts.length}`);
    console.log(`Final cumulative markout: $${lastMarkout.cumulative.toFixed(2)}`);
    console.log(`Final cumulative TVL-adjusted markout: ${lastMarkout.cumulativeTvlAdjusted.times(100).toFixed(6)}%`);
}

// Get Uniswap/Aerodrome pool info
async function getUniPoolInfo(poolId: string): Promise<UniPool> {
    console.log(`Fetching ${uniswapPoolType} pool info for: ${poolId}...`);

    const { pool } = await request<{ pool: UniPool }>(uniEndpoint, UNI_POOL_QUERY, {
        poolId: poolId.toLowerCase()
    });

    if (!pool) throw new Error(`Uniswap/Aerodrome pool with ID ${poolId} not found`);

    return pool;
}

// Get all Uniswap/Aerodrome swaps for a pool, starting from a specific timestamp
async function getAllUniSwaps(poolId: string, startTime: number = 0, customEndTime?: number): Promise<UniSwap[]> {
    console.log(`Fetching ${uniswapPoolType} swaps from timestamp ${startTime}...`);

    const swaps: UniSwap[] = [];
    let skip = 0;

    // Use custom end time if provided, otherwise use today's start (don't need today's data)
    const endTime = customEndTime || Math.floor(Date.now() / 1000 / 86400) * 86400;
    console.log(`Fetching swaps until timestamp ${endTime} (${new Date(endTime * 1000).toISOString()})...`);

    while (true) {
        const data = await request<{ swaps: UniSwap[] }>(uniEndpoint, UNI_SWAPS_QUERY, {
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

// Convert timestamp to the nearest hour timestamp (floor to hour)
function getHourTimestamp(timestamp: number): number {
    return Math.floor(timestamp / 3600) * 3600;
}

// Get the hourly timestamps that are closest to the swap timestamps
function getRelevantHourTimestamps(swaps: UniSwap[]): number[] {
    // Extract all swap timestamps and convert to hour timestamps
    const hourTimestamps = swaps.map(swap => {
        const swapTs = parseInt(swap.timestamp);
        return getHourTimestamp(swapTs);
    });

    // Add the next hour for each swap to ensure we have the closest hour
    const nextHourTimestamps = hourTimestamps.map(ts => ts + 3600);

    // Combine and deduplicate
    const allTimestamps = [...hourTimestamps, ...nextHourTimestamps];
    return [...new Set(allTimestamps)];
}

// Get hourly TVL data for a Uniswap/Aerodrome pool for specific hour timestamps
async function getUniPoolHourData(poolId: string, hourTimestamps: number[]): Promise<UniPoolHourData[]> {
    if (hourTimestamps.length === 0) {
        console.log('No hour timestamps provided, skipping TVL data fetch');
        return [];
    }

    console.log(`Fetching ${uniswapPoolType} hourly TVL data for ${hourTimestamps.length} specific hours...`);

    // Sort timestamps for better logging
    const sortedTimestamps = [...hourTimestamps].sort((a, b) => a - b);
    const minTimestamp = sortedTimestamps[0];
    const maxTimestamp = sortedTimestamps[sortedTimestamps.length - 1];

    console.log(`Time range: ${new Date(minTimestamp * 1000).toISOString()} to ${new Date(maxTimestamp * 1000).toISOString()}`);

    // We need to use the 'in' operator for the GraphQL query to filter by specific timestamps
    // But first check if the array is not too large to avoid URL length issues
    let poolHourDatas: UniPoolHourData[] = [];

    // If we have too many timestamps, we'll need to batch the requests
    const BATCH_SIZE = 100; // Adjust based on GraphQL endpoint limitations

    for (let i = 0; i < hourTimestamps.length; i += BATCH_SIZE) {
        const batchTimestamps = hourTimestamps.slice(i, i + BATCH_SIZE);

        // Create a custom query for this batch
        const batchQuery = gql`
          query GetUniPoolHourData($poolId: ID!, $hourTimestamps: [Int!]) {
            poolHourDatas(
              first: 1000,
              where: {
                pool: $poolId,
                periodStartUnix_in: $hourTimestamps
              },
              orderBy: periodStartUnix,
              orderDirection: asc
            ) {
              periodStartUnix
              tvlUSD
            }
          }
        `;

        process.stdout.write(`\rFetching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(hourTimestamps.length / BATCH_SIZE)}...`);

        const result = await request<{ poolHourDatas: UniPoolHourData[] }>(uniEndpoint, batchQuery, {
            poolId: poolId.toLowerCase(),
            hourTimestamps: batchTimestamps
        });

        poolHourDatas = [...poolHourDatas, ...result.poolHourDatas];
    }

    console.log(`\nFound ${poolHourDatas.length} hourly data points`);
    return poolHourDatas;
}

// Process Uniswap/Aerodrome swaps and calculate markouts
function processUniSwapsAndCalculateMarkouts(
    swaps: UniSwap[],
    pool: UniPool,
    prices: PriceData,
    hourlyData: UniPoolHourData[]
): MarkoutDatapoint[] {
    console.log(`\nProcessing ${uniswapPoolType} swaps and calculating markouts...`); // Fixed string interpolation

    const dayInSeconds = 86400;
    const dailyData: Record<number, {
        date: string,
        swapCount: number,
        delta0: BigNumber,
        delta1: BigNumber,
        tvlAdjustedMarkout: BigNumber
    }> = {};

    // Create a map of timestamps to TVL values for quick lookup
    const tvlByTimestamp: Record<number, BigNumber> = {};
    hourlyData.forEach(hourData => {
        const timestamp = parseInt(hourData.periodStartUnix);
        tvlByTimestamp[timestamp] = new BigNumber(hourData.tvlUSD);
    });

    // Create a function to find the closest hourly TVL data point
    const findClosestHourlyTVL = (swapTimestamp: number): BigNumber => {
        // Convert to hour timestamp
        const swapHourTs = getHourTimestamp(swapTimestamp);

        // Check if we have data for this exact hour
        if (tvlByTimestamp[swapHourTs]) {
            return tvlByTimestamp[swapHourTs];
        }

        // Check the next hour
        const nextHourTs = swapHourTs + 3600;
        if (tvlByTimestamp[nextHourTs]) {
            return tvlByTimestamp[nextHourTs];
        }

        // If we don't have either, find the closest one
        let closestTs = 0;
        let minDiff = Infinity;

        for (const tsStr in tvlByTimestamp) {
            const ts = parseInt(tsStr);
            const diff = Math.abs(ts - swapTimestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closestTs = ts;
            }
        }

        return closestTs > 0 ? tvlByTimestamp[closestTs] : new BigNumber(0);
    };

    // Process each swap and group by day
    swaps.forEach((swap: UniSwap) => {
        const swapTimestamp = parseInt(swap.timestamp);
        const dayTs = getDayTimestamp(swapTimestamp);
        const dateStr = formatDate(dayTs);

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

        // Update deltas - amount0 and amount1 are already signed values
        // Positive means the pool gained that token, negative means it lost that token
        day.delta0 = day.delta0.plus(new BigNumber(swap.amount0));
        day.delta1 = day.delta1.plus(new BigNumber(swap.amount1));

        // Calculate TVL-adjusted markout for this swap
        try {
            // Find the closest hourly TVL data point using our helper function
            const tvl = findClosestHourlyTVL(swapTimestamp);

            if (tvl.isGreaterThan(0)) {
                // Get token prices at the end of the day (EOD)
                const eodTimestamp = dayTs + dayInSeconds;
                const price0EODUSD = new BigNumber(prices[pool.token0.id][eodTimestamp] || 0);
                const price1EODUSD = new BigNumber(prices[pool.token1.id][eodTimestamp] || 0);

                if (price0EODUSD.isGreaterThan(0) && price1EODUSD.isGreaterThan(0)) {
                    // Calculate markout for this specific swap using EOD prices
                    const swapDelta0 = new BigNumber(swap.amount0);
                    const swapDelta1 = new BigNumber(swap.amount1);
                    const swapMarkout = swapDelta0.times(price0EODUSD).plus(swapDelta1.times(price1EODUSD));

                    // Calculate TVL-adjusted markout (markout / tvl) and accumulate
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

    // Calculate markouts without cumulative values (will be calculated at runtime when needed)
    const markouts: MarkoutDatapoint[] = [];

    for (const day of dailyChanges) {
        // Get EOD timestamp
        const eodTimestamp = day.timestamp + dayInSeconds;

        // Get EOD prices
        const price0 = new BigNumber(prices[pool.token0.id][eodTimestamp] || 0);
        const price1 = new BigNumber(prices[pool.token1.id][eodTimestamp] || 0);

        // Calculate daily markout using EOD prices
        const dailyMarkout = day.delta0.times(price0).plus(day.delta1.times(price1));

        // Create markout datapoint without cumulative values
        markouts.push({
            date: day.date,
            swapCount: day.swapCount,
            delta0: day.delta0,
            delta1: day.delta1,
            price0,
            price1,
            markout: dailyMarkout,
            tvlAdjustedMarkout: day.tvlAdjustedMarkout
        });
    }

    return markouts;
}

// Main function to calculate Uniswap/Aerodrome markouts
async function calculateUniswapMarkouts(poolId: string, cacheFile: string, bunniStartTimestamp: number = 0): Promise<MarkoutDatapoint[]> {
    try {
        console.log(`Running markout calculator for ${uniswapPoolType} pool ${poolId}`);

        // Read cache to get existing data
        const cachedResults = readCache(cacheFile);

        // Fetch pool info to get creation timestamp
        const pool = await getUniPoolInfo(poolId);
        const poolCreationTimestamp = parseInt(pool.createdAtTimestamp);

        console.log(`${uniswapPoolType} pool was created at timestamp ${poolCreationTimestamp} (${new Date(poolCreationTimestamp * 1000).toISOString()})`);

        // Determine the start time for fetching data
        let startTime = poolCreationTimestamp;

        // If Bunni pool's inception date is provided and it's after the pool creation date,
        // use the Bunni pool's inception date as the start time
        if (bunniStartTimestamp > 0) {
            console.log(`Bunni pool's creation timestamp: ${bunniStartTimestamp} (${new Date(bunniStartTimestamp * 1000).toISOString()})`);

            // If Bunni pool was created after this pool, we'll start from Bunni's creation
            if (bunniStartTimestamp > poolCreationTimestamp) {
                startTime = bunniStartTimestamp;
                console.log(`Using Bunni pool's creation timestamp as start time since it's newer`);
            } else {
                console.log(`Using ${uniswapPoolType} pool's creation timestamp as start time since it's newer than Bunni's`);
            }
        }

        // Check if we have valid cached data for this pool
        const hasCachedData = cachedResults &&
            cachedResults.poolId === poolId &&
            cachedResults.network === (uniswapPoolType === 'Uniswap' ? network : 'aerodrome');

        // Get information about cached data if available
        let oldestCachedTimestamp = 0;
        let lastCachedTimestamp = 0;

        if (hasCachedData && cachedResults.markouts && cachedResults.markouts.length > 0) {
            // Cached markouts should already be sorted, so we can use the first and last directly
            // Get the oldest timestamp from the first markout
            oldestCachedTimestamp = Date.parse(cachedResults.markouts[0].date) / 1000;
            console.log(`Found cached data with oldest timestamp ${oldestCachedTimestamp} (${new Date(oldestCachedTimestamp * 1000).toISOString()})`);

            // Get the last processed timestamp
            if (cachedResults.lastTimestamp) {
                lastCachedTimestamp = parseInt(cachedResults.lastTimestamp);
                console.log(`Last processed timestamp: ${lastCachedTimestamp} (${new Date(lastCachedTimestamp * 1000).toISOString()})`);
            } else {
                // If no lastTimestamp, use the newest markout date
                lastCachedTimestamp = Date.parse(cachedResults.markouts[cachedResults.markouts.length - 1].date) / 1000;
                console.log(`No lastTimestamp found, using newest markout date: ${lastCachedTimestamp} (${new Date(lastCachedTimestamp * 1000).toISOString()})`);
            }
        }

        // Determine data fetching strategy
        let needHistoricalData = false;
        let needNewData = false;

        // Variables to track what data we need to fetch
        let historicalStartTime = 0;
        let historicalEndTime = 0;
        let newDataStartTime = 0;

        if (hasCachedData) {
            // Check if we need historical data (before oldest cached data)
            if (bunniStartTimestamp > 0 && bunniStartTimestamp < oldestCachedTimestamp) {
                needHistoricalData = true;
                historicalStartTime = bunniStartTimestamp;
                historicalEndTime = oldestCachedTimestamp;
                console.log(`Bunni pool's inception (${new Date(bunniStartTimestamp * 1000).toISOString()}) is before the oldest cached data point`);
                console.log(`Will need to fetch missing historical data from ${historicalStartTime} to ${historicalEndTime}`);
            }

            // Check if we need new data (after last cached data)
            if (lastCachedTimestamp > 0) {
                needNewData = true;
                newDataStartTime = lastCachedTimestamp;
                console.log(`Will need to fetch new data after ${newDataStartTime} (${new Date(newDataStartTime * 1000).toISOString()})`);
            }

            // Determine which data to fetch first
            if (needHistoricalData && needNewData) {
                // We need both historical and new data
                // For now, let's fetch the historical data first
                console.log(`Need to fetch both historical and new data. Fetching historical data first...`);
                startTime = historicalStartTime;
                // We'll fetch new data in a separate query after processing historical data
            } else if (needHistoricalData) {
                // Only need historical data
                startTime = historicalStartTime;
                console.log(`Setting start time to Bunni pool's inception: ${startTime} (${new Date(startTime * 1000).toISOString()})`);
            } else if (needNewData) {
                // Only need new data
                startTime = newDataStartTime;
                console.log(`Setting start time to last cached timestamp: ${startTime} (${new Date(startTime * 1000).toISOString()})`);
            }
        } else {
            // Case 3: No cached data, fetch everything from the determined start time
            console.log(`No cached data available. Will fetch all swaps from timestamp ${startTime} (${new Date(startTime * 1000).toISOString()})`);
        }

        // Show token info if debug mode
        if (debug) {
            console.log(`\nToken Information:`);
            console.log(`Token 0: ${pool.token0.symbol} (ID: ${pool.token0.id})`);
            console.log(`Token 1: ${pool.token1.symbol} (ID: ${pool.token1.id})`);
        }

        // Fetch swaps based on what data we need
        let allSwaps: UniSwap[] = [];

        // Case 1: We need both historical and new data
        if (needHistoricalData && needNewData) {
            console.log(`Need to fetch both historical and new data`);

            // First, fetch historical data (from Bunni inception to oldest cached data)
            console.log(`Fetching historical swaps from ${historicalStartTime} to ${historicalEndTime}`);
            const historicalSwaps = await getAllUniSwaps(poolId, historicalStartTime, historicalEndTime);
            console.log(`Fetched ${historicalSwaps.length} historical swaps`);

            // Then, fetch new data (from last cached timestamp to now)
            console.log(`Fetching new swaps after ${newDataStartTime}`);
            const recentSwaps = await getAllUniSwaps(poolId, newDataStartTime);
            console.log(`Fetched ${recentSwaps.length} new swaps`);

            // Combine both sets of swaps
            allSwaps = [...historicalSwaps, ...recentSwaps];
            console.log(`Combined ${allSwaps.length} total swaps`);
        }
        // Case 2: We only need historical data
        else if (needHistoricalData) {
            console.log(`Fetching historical swaps from ${historicalStartTime} to ${historicalEndTime}`);
            allSwaps = await getAllUniSwaps(poolId, historicalStartTime, historicalEndTime);
        }
        // Case 3: We only need new data
        else if (needNewData) {
            console.log(`Fetching new swaps after ${newDataStartTime}`);
            allSwaps = await getAllUniSwaps(poolId, newDataStartTime);
        }
        // Case 4: We're fetching all data from scratch
        else {
            console.log(`Fetching all swaps from ${startTime}`);
            allSwaps = await getAllUniSwaps(poolId, startTime);
        }

        // If no swaps found, handle accordingly
        if (allSwaps.length === 0 && !hasCachedData) {
            console.log('No swaps found for this pool.');
            return [];
        }

        if (allSwaps.length === 0 && hasCachedData) {
            console.log('No new swaps found since last update. Using cached markouts.');

            // Filter cached markouts to only include those after Bunni pool's inception if needed
            let filteredMarkouts = cachedResults.markouts;
            if (bunniStartTimestamp > 0) {
                const bunniStartDate = formatDate(bunniStartTimestamp);
                filteredMarkouts = cachedResults.markouts.filter(m => {
                    return new Date(m.date) >= new Date(bunniStartDate);
                });
                console.log(`Filtered markouts to only include those after Bunni pool's inception: ${filteredMarkouts.length} of ${cachedResults.markouts.length}`);
            }

            displayMarkouts(
                filteredMarkouts,
                pool.token0.symbol,
                pool.token1.symbol
            );
            console.log(`\nTotal swaps processed: ${cachedResults.swapCount}`);
            console.log(`Cache file: ${cacheFile}`);
            return filteredMarkouts;
        }

        // Get the latest timestamp from the new swaps for caching
        const latestTimestamp = allSwaps.length > 0 ?
            allSwaps[allSwaps.length - 1].timestamp :
            startTime.toString();

        // Calculate total swap count
        const totalSwapCount = hasCachedData ?
            cachedResults.swapCount + allSwaps.length :
            allSwaps.length;

        // Show first few swaps in debug mode
        if (debug && allSwaps.length > 0) {
            console.log(`\nSample Swap Data (First 3):`);
            allSwaps.slice(0, 3).forEach((swap: UniSwap, i: number) => {
                console.log(`Swap ${i + 1}:`);
                console.log(`  Timestamp: ${swap.timestamp} (${new Date(parseInt(swap.timestamp) * 1000).toISOString()})`);
                console.log(`  Amount0: ${swap.amount0}`);
                console.log(`  Amount1: ${swap.amount1}`);
            });
        }

        // Define day in seconds constant
        const dayInSeconds = 86400;

        // Initialize prices data structure
        let prices: PriceData = {
            [pool.token0.id]: {},
            [pool.token1.id]: {}
        };

        // Get all timestamps we need prices for
        const allTimestamps: number[] = [];
        allSwaps.forEach((swap: UniSwap) => {
            const dayTs = getDayTimestamp(parseInt(swap.timestamp));
            allTimestamps.push(dayTs + dayInSeconds);
        });
        const uniqueTimestamps = [...new Set(allTimestamps)];

        // Check if we have cached prices and use them
        let timestampsToFetch: number[] = uniqueTimestamps;

        if (cachedResults && cachedResults.prices &&
            cachedResults.prices.token0Id === pool.token0.id &&
            cachedResults.prices.token1Id === pool.token1.id) {
            console.log('Found cached price data');

            // Copy cached prices to our prices object
            const cachedPrices = cachedResults.prices.data;
            prices[pool.token0.id] = { ...cachedPrices[pool.token0.id] };
            prices[pool.token1.id] = { ...cachedPrices[pool.token1.id] };

            // Filter out timestamps that are already in the cache
            timestampsToFetch = uniqueTimestamps.filter(timestamp => {
                const hasToken0Price = prices[pool.token0.id][timestamp] !== undefined;
                const hasToken1Price = prices[pool.token1.id][timestamp] !== undefined;
                return !(hasToken0Price && hasToken1Price);
            });

            console.log(`Using ${uniqueTimestamps.length - timestampsToFetch.length} cached timestamps, need to fetch ${timestampsToFetch.length} new timestamps`);
        }

        // Fetch only the timestamps that aren't in the cache
        if (timestampsToFetch.length > 0) {
            console.log('Fetching missing price data from DeFiLlama...');

            // Get prices only for timestamps not in cache
            const newPrices = await getPrices(
                pool.token0.id,
                pool.token1.id,
                timestampsToFetch
            );

            // Merge new prices with cached prices
            Object.entries(newPrices[pool.token0.id]).forEach(([timestampStr, price]) => {
                const timestamp = parseInt(timestampStr);
                // Find the closest day timestamp
                const dayTimestamp = findClosestDayTimestamp(timestamp);
                prices[pool.token0.id][dayTimestamp] = price;
            });

            Object.entries(newPrices[pool.token1.id]).forEach(([timestampStr, price]) => {
                const timestamp = parseInt(timestampStr);
                // Find the closest day timestamp
                const dayTimestamp = findClosestDayTimestamp(timestamp);
                prices[pool.token1.id][dayTimestamp] = price;
            });
        } else if (uniqueTimestamps.length > 0) {
            console.log('All required prices found in cache, no need to fetch from DeFiLlama');
        }

        // Get relevant hour timestamps from the swaps
        const relevantHourTimestamps = getRelevantHourTimestamps(allSwaps);

        // Fetch hourly TVL data only for the relevant hours
        const hourlyData = await getUniPoolHourData(poolId, relevantHourTimestamps);

        // Process swaps and calculate markouts
        const newMarkouts = processUniSwapsAndCalculateMarkouts(allSwaps, pool, prices, hourlyData);

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

            // Add or update with new markouts (without relying on cached cumulative values)
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

        // Filter markouts to only include those after Bunni pool's inception if needed
        if (bunniStartTimestamp > 0) {
            const bunniStartDate = formatDate(bunniStartTimestamp);
            const originalLength = combinedMarkouts.length;
            combinedMarkouts = combinedMarkouts.filter(m => {
                return new Date(m.date) >= new Date(bunniStartDate);
            });
            console.log(`Filtered markouts to only include those after Bunni pool's inception: ${combinedMarkouts.length} of ${originalLength}`);
        }

        // Create a filtered version of prices that excludes zero values for caching
        const pricesToCache: PriceData = {
            [pool.token0.id]: {},
            [pool.token1.id]: {}
        };

        // Only include non-zero prices in the cache
        Object.entries(prices[pool.token0.id]).forEach(([timestampStr, price]) => {
            const timestamp = parseInt(timestampStr);
            if (price > 0) {
                pricesToCache[pool.token0.id][timestamp] = price;
            }
        });

        Object.entries(prices[pool.token1.id]).forEach(([timestampStr, price]) => {
            const timestamp = parseInt(timestampStr);
            if (price > 0) {
                pricesToCache[pool.token1.id][timestamp] = price;
            }
        });

        // Cache the final results with filtered prices
        const resultsToCache: CachedResults = {
            poolId,
            network: uniswapPoolType === 'Uniswap' ? network : 'aerodrome', // Use 'aerodrome' as network for Aerodrome pools
            poolSymbols: {
                currency0: pool.token0.symbol,
                currency1: pool.token1.symbol
            },
            swapCount: totalSwapCount,
            lastTimestamp: latestTimestamp,
            // Store the combined markouts in the cache (without cumulative values)
            markouts: combinedMarkouts,
            prices: {
                token0Id: pool.token0.id,
                token1Id: pool.token1.id,
                data: pricesToCache
            }
        };

        writeCache(resultsToCache, cacheFile);

        // Display results
        displayMarkouts(combinedMarkouts, pool.token0.symbol, pool.token1.symbol);

        console.log(`\nTotal swaps processed: ${totalSwapCount}`);
        console.log(`New swaps processed: ${allSwaps.length}`);
        console.log(`Results cached to: ${cacheFile}`);

        return combinedMarkouts;
    } catch (error) {
        console.error('Error:', (error as Error).message);
        return [];
    }
}

// Main function to calculate Bunni markouts
async function calculateBunniMarkouts(poolId: string, cacheFile: string): Promise<MarkoutDatapoint[]> {
    try {
        console.log(`Running markout calculator for Bunni pool ${poolId} on ${network}`);

        // Read cache to get existing data
        const cachedResults = readCache(cacheFile);

        // Fetch pool info to get creation timestamp
        const pool = await getPoolInfo(poolId);
        const poolCreationTimestamp = parseInt(pool.creationTimestamp);

        console.log(`Bunni pool was created at timestamp ${poolCreationTimestamp} (${new Date(poolCreationTimestamp * 1000).toISOString()})`);

        // Determine the start time for fetching data
        let startTime = poolCreationTimestamp;

        // Check if we have valid cached data for this pool and network
        const hasCachedData = cachedResults &&
            cachedResults.poolId === poolId &&
            cachedResults.network === network;

        // Get information about cached data if available
        let oldestCachedTimestamp = 0;
        let lastCachedTimestamp = 0;

        if (hasCachedData && cachedResults.markouts && cachedResults.markouts.length > 0) {
            // Sort markouts by date to ensure we get the correct oldest and newest
            const sortedMarkouts = [...cachedResults.markouts].sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            // Get the oldest timestamp from the first markout
            oldestCachedTimestamp = Date.parse(sortedMarkouts[0].date) / 1000;
            console.log(`Found cached data with oldest timestamp ${oldestCachedTimestamp} (${new Date(oldestCachedTimestamp * 1000).toISOString()})`);

            // Get the last processed timestamp
            if (cachedResults.lastTimestamp) {
                lastCachedTimestamp = parseInt(cachedResults.lastTimestamp);
                console.log(`Last processed timestamp: ${lastCachedTimestamp} (${new Date(lastCachedTimestamp * 1000).toISOString()})`);
            } else {
                // If no lastTimestamp, use the newest markout date
                lastCachedTimestamp = Date.parse(sortedMarkouts[sortedMarkouts.length - 1].date) / 1000;
                console.log(`No lastTimestamp found, using newest markout date: ${lastCachedTimestamp} (${new Date(lastCachedTimestamp * 1000).toISOString()})`);
            }
        }

        // Determine data fetching strategy
        if (hasCachedData) {
            // Check if we need new data (after last cached data)
            if (lastCachedTimestamp > 0) {
                console.log(`Will need to fetch new data after ${lastCachedTimestamp} (${new Date(lastCachedTimestamp * 1000).toISOString()})`);

                // Start from last cached timestamp to get new data
                startTime = lastCachedTimestamp;
                console.log(`Setting start time to last cached timestamp: ${startTime} (${new Date(startTime * 1000).toISOString()})`);
            }
        } else {
            // No cached data, fetch everything from the pool creation timestamp
            console.log(`No cached data available. Will fetch all swaps from timestamp ${startTime} (${new Date(startTime * 1000).toISOString()})`);
        }

        // Show token info if debug mode
        if (debug) {
            console.log(`\nToken Information:`);
            console.log(`Token 0: ${pool.currency0.symbol} (ID: ${pool.currency0.id})`);
            console.log(`Token 1: ${pool.currency1.symbol} (ID: ${pool.currency1.id})`);
        }

        // Fetch swaps based on what data we need
        let allSwaps: Swap[] = [];

        // For Bunni pools, we just need to fetch from the start time to now
        allSwaps = await getAllSwaps(poolId, startTime);

        // If no swaps found and no cached data, nothing to do
        if (allSwaps.length === 0 && !hasCachedData) {
            console.log('No swaps found for this pool.');
            return [];
        }

        // If no swaps but we have cached data, just display the cached results
        if (allSwaps.length === 0 && hasCachedData) {
            console.log('No new swaps found since last update. Using cached markouts.');
            displayMarkouts(
                cachedResults.markouts,
                pool.currency0.symbol,
                pool.currency1.symbol
            );
            console.log(`\nTotal swaps processed: ${cachedResults.swapCount}`);
            console.log(`Cache file: ${cacheFile}`);
            return cachedResults.markouts;
        }

        // Get the latest timestamp from the swaps for caching
        const latestTimestamp = allSwaps.length > 0 ?
            allSwaps[allSwaps.length - 1].timestamp :
            startTime.toString();

        // Calculate total swap count (cached + new)
        const totalSwapCount = hasCachedData ?
            cachedResults.swapCount + allSwaps.length :
            allSwaps.length;

        // Show first few swaps in debug mode
        if (debug && allSwaps.length > 0) {
            console.log(`\nSample Swap Data (First 3):`);
            allSwaps.slice(0, 3).forEach((swap: Swap, i: number) => {
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
        allSwaps.forEach((swap: Swap) => {
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
        const newMarkouts = processSwapsAndCalculateMarkouts(allSwaps, pool, prices);

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

            // Add or update with new markouts (without relying on cached cumulative values)
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
            // Store the combined markouts in the cache (without cumulative values)
            markouts: combinedMarkouts,
            prices: {
                token0Id: pool.currency0.id,
                token1Id: pool.currency1.id,
                data: pricesToCache
            }
        };

        writeCache(resultsToCache, cacheFile);

        // Display results
        displayMarkouts(combinedMarkouts, pool.currency0.symbol, pool.currency1.symbol);

        console.log(`\nTotal swaps processed: ${totalSwapCount}`);
        console.log(`New swaps processed: ${allSwaps.length}`);
        console.log(`Results cached to: ${cacheFile}`);

        return combinedMarkouts;
    } catch (error) {
        console.error('Error:', (error as Error).message);
        return [];
    }
}

// Function to display a combined TVL-adjusted chart for both Bunni and Uniswap/Aerodrome pools
function displayCombinedTvlAdjustedChart(bunniMarkouts: MarkoutDatapoint[], uniMarkouts: MarkoutDatapoint[]): void {
    // Create maps for easy lookup
    const bunniByDate = new Map<string, MarkoutDatapoint>();
    const uniByDate = new Map<string, MarkoutDatapoint>();

    bunniMarkouts.forEach(m => bunniByDate.set(m.date, m));
    uniMarkouts.forEach(m => uniByDate.set(m.date, m));

    // Get all unique dates
    const allDates = [...new Set([...bunniByDate.keys(), ...uniByDate.keys()])].sort();

    // Prepare data series for the combined chart
    const bunniCumulativeTvlAdjusted: number[] = [];
    const uniCumulativeTvlAdjusted: number[] = [];

    // Calculate cumulative values at runtime
    let bunniCumulative = new BigNumber(0);
    let uniCumulative = new BigNumber(0);

    allDates.forEach(date => {
        const bunni = bunniByDate.get(date);
        const uni = uniByDate.get(date);

        // Add daily TVL-adjusted markout to cumulative values
        if (bunni) bunniCumulative = bunniCumulative.plus(bunni.tvlAdjustedMarkout);
        if (uni) uniCumulative = uniCumulative.plus(uni.tvlAdjustedMarkout);

        // Convert to percentage for chart
        bunniCumulativeTvlAdjusted.push(bunniCumulative.times(100).toNumber());
        uniCumulativeTvlAdjusted.push(uniCumulative.times(100).toNumber());
    });

    // Configuration for combined TVL-adjusted markout chart
    const combinedConfig = {
        height: 20,
        colors: [asciichart.blue, asciichart.green],
    };

    // Generate combined TVL-adjusted markout chart
    console.log('\nCombined Cumulative TVL-Adjusted Markout Performance Chart (%):');
    console.log(`Blue: Bunni, Green: ${uniswapPoolType}`);
    console.log(asciichart.plot([bunniCumulativeTvlAdjusted, uniCumulativeTvlAdjusted], combinedConfig));
}

// Function to compare markouts from Bunni and UniswapAerodrome pools
function compareMarkouts(bunniMarkouts: MarkoutDatapoint[], uniMarkouts: MarkoutDatapoint[]): void {
    console.log('\n---------------------------------------------------');
    console.log(`Comparison of Bunni and ${uniswapPoolType} Pool Performance:`);
    console.log('---------------------------------------------------');

    // Create a map of dates for easy lookup
    const bunniByDate = new Map<string, MarkoutDatapoint>();
    const uniByDate = new Map<string, MarkoutDatapoint>();

    bunniMarkouts.forEach(m => bunniByDate.set(m.date, m));
    uniMarkouts.forEach(m => uniByDate.set(m.date, m));

    // Get all unique dates
    const allDates = [...new Set([...bunniByDate.keys(), ...uniByDate.keys()])].sort();

    // Display comparison table
    console.log('Date'.padEnd(12),
        'Bunni Markout ($)'.padEnd(18),
        `${uniswapPoolType} Markout ($)`.padEnd(18),
        'Bunni TVL-Adj (%)'.padEnd(18),
        `${uniswapPoolType} TVL-Adj (%)`.padEnd(18));
    console.log('-'.repeat(85));

    // Calculate cumulative values at runtime
    let bunniCumulative = new BigNumber(0);
    let uniCumulative = new BigNumber(0);
    let bunniCumulativeTvlAdj = new BigNumber(0);
    let uniCumulativeTvlAdj = new BigNumber(0);

    allDates.forEach(date => {
        const bunni = bunniByDate.get(date);
        const uni = uniByDate.get(date);

        // Add daily values to cumulative totals
        if (bunni) {
            bunniCumulative = bunniCumulative.plus(bunni.markout);
            bunniCumulativeTvlAdj = bunniCumulativeTvlAdj.plus(bunni.tvlAdjustedMarkout);
        }

        if (uni) {
            uniCumulative = uniCumulative.plus(uni.markout);
            uniCumulativeTvlAdj = uniCumulativeTvlAdj.plus(uni.tvlAdjustedMarkout);
        }

        console.log(
            date.padEnd(12),
            bunni ? `$${bunni.markout.toFixed(2)}`.padEnd(18) : 'N/A'.padEnd(18),
            uni ? `$${uni.markout.toFixed(2)}`.padEnd(18) : 'N/A'.padEnd(18),
            bunni ? `${bunni.tvlAdjustedMarkout.times(100).toFixed(6)}%`.padEnd(18) : 'N/A'.padEnd(18),
            uni ? `${uni.tvlAdjustedMarkout.times(100).toFixed(6)}%`.padEnd(18) : 'N/A'.padEnd(18)
        );
    });

    console.log('-'.repeat(85));
    console.log(
        'TOTAL'.padEnd(12),
        `$${bunniCumulative.toFixed(2)}`.padEnd(18),
        `$${uniCumulative.toFixed(2)}`.padEnd(18),
        `${bunniCumulativeTvlAdj.times(100).toFixed(6)}%`.padEnd(18),
        `${uniCumulativeTvlAdj.times(100).toFixed(6)}%`.padEnd(18)
    );

    // Display the combined TVL-adjusted chart
    displayCombinedTvlAdjustedChart(bunniMarkouts, uniMarkouts);
}

// Main function to run both analyses and compare results
async function runComparison(): Promise<void> {
    console.log(`Starting comparison between Bunni and ${uniswapPoolType} pools...\n`);

    // Get Bunni pool info to determine creation timestamp
    let bunniCreationTimestamp = 0;
    try {
        const bunniPool = await getPoolInfo(bunniPoolId);
        bunniCreationTimestamp = parseInt(bunniPool.creationTimestamp);
        console.log(`Bunni pool was created at timestamp ${bunniCreationTimestamp} (${new Date(bunniCreationTimestamp * 1000).toISOString()})`);
    } catch (error) {
        console.warn(`Warning: Could not determine Bunni pool creation time: ${(error as Error).message}`);
        console.log('Will use default start time of 0');
    }

    // Calculate Bunni markouts
    const bunniCacheFile = getBunniCacheFile(bunniPoolId, network);
    const bunniMarkouts = await calculateBunniMarkouts(bunniPoolId, bunniCacheFile);

    // Calculate Uniswap/Aerodrome markouts if provided, using Bunni pool's creation timestamp
    let uniMarkouts: MarkoutDatapoint[] = [];
    if (uniPoolId) {
        console.log('\n---------------------------------------------------\n');
        const uniCacheFile = getUniCacheFile(uniPoolId);
        // Pass the Bunni pool's creation timestamp to ensure proper time alignment
        uniMarkouts = await calculateUniswapMarkouts(uniPoolId, uniCacheFile, bunniCreationTimestamp);
    }

    // Compare results if both analyses were run
    if (bunniMarkouts.length > 0 && uniMarkouts.length > 0) {
        compareMarkouts(bunniMarkouts, uniMarkouts);
    }
}

// Run the comparison
runComparison();

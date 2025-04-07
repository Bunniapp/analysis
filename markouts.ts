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
}

interface PriceData {
    [token: string]: {
        [timestamp: number]: number;
    };
}

interface CoinsResponse {
    coins: {
        [key: string]: {
            price: number;
        };
    };
}

interface DailySwapChange {
    timestamp: number;
    date: string;
    delta0: BigNumber;
    delta1: BigNumber;
    swapCount: number;
}

interface MarkoutDatapoint {
    date: string;
    swapCount: number;
    delta0: BigNumber;
    delta1: BigNumber;
    price0: BigNumber;
    price1: BigNumber;
    markout: BigNumber;
    cumulative: string;
}

interface CachedResults {
    poolId: string;
    network: string;
    poolSymbols: {
        currency0: string;
        currency1: string;
    };
    swapCount: number;
    markouts: MarkoutDatapoint[];
}

// Parse command line arguments
const args = process.argv.slice(2);
let poolId = '';
let network = 'mainnet';
let forceRefresh = false;
let debug = false;

for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--pool' || args[i] === '-p') && i + 1 < args.length) {
        poolId = args[i + 1];
        i++;
    } else if ((args[i] === '--network' || args[i] === '-n') && i + 1 < args.length) {
        network = args[i + 1];
        i++;
    } else if (args[i] === '--refresh' || args[i] === '-r') {
        forceRefresh = true;
    } else if (args[i] === '--debug' || args[i] === '-d') {
        debug = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
        console.log(`
Usage: bun run markout.ts --pool <poolId> [--network <network>] [--refresh] [--debug]

Options:
  --pool, -p     Pool ID (address)
  --network, -n  Network to query (default: mainnet)
  --refresh, -r  Force refresh cache
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
  query GetSwaps($poolId: ID!, $skip: Int!) {
    swaps(
      first: 1000,
      skip: $skip,
      where: { pool: $poolId },
      orderBy: timestamp,
      orderDirection: asc
    ) {
      id
      timestamp
      zeroForOne
      inputAmount
      outputAmount
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
                    key === 'markout') {
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
                Array.isArray(data.markouts) &&
                data.markouts.every((m: any) => (
                    typeof m.date === 'string' &&
                    typeof m.swapCount === 'number' &&
                    m.delta0 instanceof BigNumber &&
                    m.delta1 instanceof BigNumber &&
                    m.price0 instanceof BigNumber &&
                    m.price1 instanceof BigNumber &&
                    m.markout instanceof BigNumber &&
                    typeof m.cumulative === 'string'
                ))
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
    const date = new Date(timestamp * 1000);
    date.setUTCHours(0, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
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

// Get all swaps for a pool
async function getAllSwaps(poolId: string): Promise<Swap[]> {
    console.log(`Fetching swaps...`);

    const swaps: Swap[] = [];
    let skip = 0;

    while (true) {
        const data = await request<{ swaps: Swap[] }>(endpoint, SWAPS_QUERY, {
            poolId: poolId.toLowerCase(),
            skip
        });

        const batch = data.swaps;
        swaps.push(...batch);

        if (batch.length < 1000) break;
        skip += 1000;
        process.stdout.write(`\rFetched ${swaps.length} swaps...`);
    }

    console.log(`\nFound ${swaps.length} swaps`);
    return swaps;
}

// Get token prices
async function getPrices(token0: string, token1: string, timestamps: number[]): Promise<PriceData> {
    const uniqueTimestamps = [...new Set(timestamps)];

    // Create a map to store prices by timestamp
    const prices: PriceData = {
        [token0]: {},
        [token1]: {}
    };

    console.log(`\nFetching prices for ${uniqueTimestamps.length} unique days...`);

    // Process in batches of 100 to avoid rate limiting
    const batchSize = 100;
    for (let i = 0; i < uniqueTimestamps.length; i += batchSize) {
        const batch = uniqueTimestamps.slice(i, i + batchSize);

        await Promise.all(batch.map(async (timestamp: number) => {
            try {
                // Fetch prices for both tokens in a single request
                const coins = `${chainName}:${token0},${chainName}:${token1}`;
                const url = process.env.DEFILLAMA_API_KEY
                    ? `https://pro-api.llama.fi/${process.env.DEFILLAMA_API_KEY}/coins/prices/historical/${timestamp}/${coins}`
                    : `https://coins.llama.fi/prices/historical/${timestamp}/${coins}`;

                const response = await fetch(url);
                if (!response.ok) throw new Error(`API error: ${response.status}`);

                const data = await response.json() as CoinsResponse;

                // Store prices
                const coin0Key = `${chainName}:${token0}`;
                const coin1Key = `${chainName}:${token1}`;

                prices[token0][timestamp] = (data.coins[coin0Key]?.price) || 0;
                prices[token1][timestamp] = (data.coins[coin1Key]?.price) || 0;
            } catch (error) {
                console.error(`Error fetching prices at ${timestamp}: ${(error as Error).message}`);
                prices[token0][timestamp] = 0;
                prices[token1][timestamp] = 0;
            }
        }));

        process.stdout.write(`\rProcessed ${Math.min((i + batchSize), uniqueTimestamps.length)}/${uniqueTimestamps.length} days...`);

        // Small delay to avoid rate limiting
        if (i + batchSize < uniqueTimestamps.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log('\nPrice data fetched');
    return prices;
}

// Group swaps by day and calculate daily balance changes
function calculateDailySwapChanges(
    swaps: Swap[]
): DailySwapChange[] {
    console.log('\nGrouping swaps by day and calculating changes...');

    const dailyChanges: Record<number, DailySwapChange> = {};

    // Process each swap
    swaps.forEach((swap: Swap) => {
        const dayTs = getDayTimestamp(parseInt(swap.timestamp));
        const dateStr = formatDate(dayTs);

        // Initialize day if not exists
        if (!dailyChanges[dayTs]) {
            dailyChanges[dayTs] = {
                timestamp: dayTs,
                date: dateStr,
                delta0: new BigNumber(0),
                delta1: new BigNumber(0),
                swapCount: 0
            };
        }

        // Update day metrics
        const day = dailyChanges[dayTs];
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
    });

    // Convert to array and sort by timestamp
    // Remove last entry since day is incomplete
    return Object.values(dailyChanges).sort((a, b) => a.timestamp - b.timestamp).slice(0, -1);
}

// Print markout results
function displayMarkouts(markouts: MarkoutDatapoint[], currency0Symbol: string, currency1Symbol: string): void {
    if (currency0Symbol === 'Native Currency') currency0Symbol = 'ETH';

    console.log('\nDaily Markout Results using EOD price:');
    console.log('-'.repeat(100));
    console.log(
        'Date'.padEnd(12),
        'Swaps'.padEnd(8),
        `Δ ${currency0Symbol}`.padEnd(15),
        `Δ ${currency1Symbol}`.padEnd(15),
        'Price 0'.padEnd(8),
        'Price 1'.padEnd(8),
        'Daily Markout ($)'.padEnd(15),
        'Cum Markout ($)'.padEnd(15)
    );
    console.log('-'.repeat(100));

    markouts.forEach(m => {
        console.log(
            m.date.padEnd(12),
            m.swapCount.toString().padEnd(8),
            m.delta0.toFixed(6).padEnd(15),
            m.delta1.toFixed(6).padEnd(15),
            `$${m.price0.toFixed(2)}`.padEnd(10),
            `$${m.price1.toFixed(2)}`.padEnd(10),
            `$${m.markout.toFixed(2)}`.padEnd(15),
            `$${m.cumulative}`.padEnd(15)
        );
    });

    // Add charts after the table
    displayCharts(markouts);

    // Summary
    const lastMarkout = markouts[markouts.length - 1];
    console.log('\nSummary:');
    console.log(`Pool: ${currency0Symbol}/${currency1Symbol}`);
    console.log(`Total days with swap activity: ${markouts.length}`);
    console.log(`Final cumulative markout: $${lastMarkout.cumulative}`);
}

// Add this function to generate charts
function displayCharts(markouts: MarkoutDatapoint[]): void {
    const config = {
        height: 20,
        colors: [
            asciichart.blue,    // Markouts
        ],
    };

    // Prepare data series
    const cumulativeMarkouts = markouts.map(m => parseFloat(m.cumulative));

    // Generate chart
    console.log('\nCumulative Performance Chart:');
    console.log('Blue = Markouts');
    console.log(asciichart.plot(
        [cumulativeMarkouts],
        config
    ));
}

// Main function
async function calculateMarkouts(poolId: string): Promise<void> {
    try {
        console.log(`Running markout calculator for pool ${poolId} on ${network}`);

        // Check if we have cached results
        const cachedResults = !forceRefresh ? readCache() : null;

        if (cachedResults && cachedResults.poolId === poolId && cachedResults.network === network &&
            cachedResults.markouts.length > 0) {
            console.log('Using cached markout results');
            displayMarkouts(
                cachedResults.markouts,
                cachedResults.poolSymbols.currency0,
                cachedResults.poolSymbols.currency1
            );

            console.log(`\nTotal swaps processed: ${cachedResults.swapCount}`);
            console.log(`Cache file: ${MARKOUTS_CACHE_FILE}`);
            return;
        }

        // If no cache or force refresh, compute everything
        console.log('No cached results found, calculating markouts from scratch');

        // Fetch pool info
        const pool = await getPoolInfo(poolId);

        // Show token info if debug mode
        if (debug) {
            console.log(`\nToken Information:`);
            console.log(`Token 0: ${pool.currency0.symbol} (ID: ${pool.currency0.id})`);
            console.log(`Token 1: ${pool.currency1.symbol} (ID: ${pool.currency1.id})`);
        }

        // Fetch all swaps
        const swaps = await getAllSwaps(poolId);

        if (swaps.length === 0) {
            console.log('No swaps found for this pool.');
            return;
        }

        // Calculate daily swap-based changes
        const dailyChanges = calculateDailySwapChanges(swaps);

        // Show first few swaps in debug mode
        if (debug && swaps.length > 0) {
            console.log(`\nSample Swap Data (First 3):`);
            swaps.slice(0, 3).forEach((swap, i) => {
                console.log(`Swap ${i + 1}:`);
                console.log(`  Direction: ${swap.zeroForOne ? 'Zero For One' : 'One For Zero'}`);
                console.log(`  Input Amount: ${swap.inputAmount}`);
                console.log(`  Output Amount: ${swap.outputAmount}`);
            });

            // Show raw daily changes
            console.log(`\nRaw Daily Changes (First 3):`);
            dailyChanges.slice(0, 3).forEach((day, i) => {
                console.log(`Day ${i + 1} (${day.date}):`);
                console.log(`  Raw Delta0: ${day.delta0.toString()}`);
                console.log(`  Raw Delta1: ${day.delta1.toString()}`);
            });
        }

        // Get all days we need prices for
        // Need to offset by 24 hours to get EOD prices
        const dayInSeconds = 86400;
        const dayTimestamps = dailyChanges.map(day => day.timestamp + dayInSeconds);

        // Get prices for all days
        const prices = await getPrices(
            pool.currency0.id,
            pool.currency1.id,
            dayTimestamps
        );

        // Calculate markouts
        console.log('\nCalculating markouts...');

        const markouts: MarkoutDatapoint[] = [];
        let cumulative = new BigNumber(0);

        for (const day of dailyChanges) {
            // Offset by 24 hours to get EOD prices
            const timestamp = day.timestamp + dayInSeconds;

            const delta0 = day.delta0;
            const delta1 = day.delta1;

            // Get prices
            const price0 = new BigNumber(prices[pool.currency0.id][timestamp] || 0);
            const price1 = new BigNumber(prices[pool.currency1.id][timestamp] || 0);

            // Calculate markout using only swap-related balance changes
            const dailyMarkout = delta0.times(price0).plus(delta1.times(price1));
            cumulative = cumulative.plus(dailyMarkout);

            markouts.push({
                date: day.date,
                swapCount: day.swapCount,
                delta0,
                delta1,
                price0,
                price1,
                markout: dailyMarkout,
                cumulative: cumulative.toFixed(2)
            });
        }

        // Cache the final results
        const resultsToCache: CachedResults = {
            poolId,
            network,
            poolSymbols: {
                currency0: pool.currency0.symbol,
                currency1: pool.currency1.symbol
            },
            swapCount: swaps.length,
            markouts
        };

        writeCache(resultsToCache);

        // Display results
        displayMarkouts(markouts, pool.currency0.symbol, pool.currency1.symbol);

        console.log(`\nTotal swaps processed: ${swaps.length}`);
        console.log(`Results cached to: ${MARKOUTS_CACHE_FILE}`);

    } catch (error) {
        console.error('Error:', (error as Error).message);
    }
}

calculateMarkouts(poolId);

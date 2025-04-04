import { request, gql } from 'graphql-request';
import { BigNumber } from 'bignumber.js';
import { LABELS, type Category } from './labels';
import chalk from 'chalk';

// Configure BigNumber format
BigNumber.config({ DECIMAL_PLACES: 2 });

// Parse command line arguments
const args = process.argv.slice(2);
let poolId = '';
let network = 'mainnet';

// Simple argument parsing
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pool' || args[i] === '-p') {
        poolId = args[i + 1];
        i++;
    } else if (args[i] === '--network' || args[i] === '-n') {
        network = args[i + 1];
        i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
        console.log(`
Usage: bun run volumes.ts --pool <poolId> [--network <network>]

Options:
  --pool, -p     Pool ID
  --network, -n  Network to query (default: mainnet)
  --help, -h     Show help
    `);
        process.exit(0);
    }
}

if (!poolId) {
    console.error('Error: Pool ID is required. Use --pool <poolId>');
    process.exit(1);
}

// Define network subgraph endpoints
const SUBGRAPH_ENDPOINTS: Record<string, string> = {
    mainnet: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-mainnet/api`,
    arbitrum: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-arbitrum/api`,
    base: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-base/api`,
    sepolia: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-sepolia/api`,
    unichain: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_API_KEY}/bacon-labs/bunni-v2-unichain/api`
};

const endpoint = SUBGRAPH_ENDPOINTS[network] || SUBGRAPH_ENDPOINTS.mainnet;

// Define the GraphQL query for pool info
const GET_POOL_INFO = gql`
  query GetPoolInfo($poolId: ID!) {
    pool(id: $poolId) {
      id
      currency0 {
        symbol
      }
      currency1 {
        symbol
      }
      volumeUSD
    }
  }
`;

// Define the GraphQL query for swaps with pagination
const GET_POOL_SWAPS = gql`
  query GetPoolSwaps($poolId: ID!, $skip: Int!, $first: Int!) {
    swaps(
      first: $first,
      skip: $skip,
      where: { pool: $poolId },
      orderBy: timestamp,
      orderDirection: asc
    ) {
      id
      transaction {
        to
      }
      amountUSD
    }
  }
`;

interface Swap {
    id: string;
    transaction: {
        to: string;
    };
    amountUSD: string;
}

interface Pool {
    id: string;
    currency0: {
        symbol: string;
    };
    currency1: {
        symbol: string;
    };
    volumeUSD: string;
}

interface RouterStats {
    router: string;
    label?: string;
    category?: Category;
    volumeUSD: BigNumber;
    swapCount: number;
    percentOfPoolVolume: number;
}

async function getPoolInfo(poolId: string): Promise<Pool> {
    const data = await request(endpoint, GET_POOL_INFO, {
        poolId: poolId.toLowerCase()
    });

    if (!data.pool) {
        throw new Error(`Pool with ID ${poolId} not found on ${network}`);
    }

    return data.pool;
}

async function getAllSwaps(poolId: string): Promise<Swap[]> {
    const pageSize = 1000;
    let skip = 0;
    const allSwaps: Swap[] = [];
    let hasMore = true;

    console.log('Fetching swaps with pagination...');

    while (hasMore) {
        const data = await request(endpoint, GET_POOL_SWAPS, {
            poolId: poolId.toLowerCase(),
            skip,
            first: pageSize
        });

        const swaps: Swap[] = data.swaps;
        allSwaps.push(...swaps);

        process.stdout.write(`\rFetched ${allSwaps.length} swaps so far...`);

        if (swaps.length < pageSize) {
            hasMore = false;
        } else {
            skip += pageSize;
        }
    }

    console.log(`\nCompleted fetching all ${allSwaps.length} swaps`);
    return allSwaps;
}

async function getRouterStats(poolId: string): Promise<void> {
    try {
        console.log(`Fetching data for pool: ${poolId} on ${network}...`);

        const pool = await getPoolInfo(poolId);
        const swaps = await getAllSwaps(poolId);

        console.log(`\nAnalyzing ${swaps.length} swaps for ${pool.currency0.symbol}/${pool.currency1.symbol} pool`);
        console.log(`Total pool volume: $${new BigNumber(pool.volumeUSD).toFormat()}`);

        const routerMap = new Map<string, { volumeUSD: BigNumber, swapCount: number }>();

        swaps.forEach(swap => {
            const to = swap.transaction.to;
            const amountUSD = new BigNumber(swap.amountUSD);

            if (!routerMap.has(to)) {
                routerMap.set(to, { volumeUSD: new BigNumber(0), swapCount: 0 });
            }

            const routerStats = routerMap.get(to)!;
            routerStats.volumeUSD = routerStats.volumeUSD.plus(amountUSD);
            routerStats.swapCount++;
        });

        const totalVolumeUSD = new BigNumber(pool.volumeUSD);
        const routerStats: RouterStats[] = Array.from(routerMap.entries()).map(([router, stats]) => ({
            router,
            label: LABELS[router.toLowerCase()]?.name || 'Unknown',
            category: LABELS[router.toLowerCase()]?.category,
            volumeUSD: stats.volumeUSD,
            swapCount: stats.swapCount,
            percentOfPoolVolume: stats.volumeUSD.dividedBy(totalVolumeUSD).multipliedBy(100).toNumber()
        }));

        routerStats.sort((a, b) => b.volumeUSD.minus(a.volumeUSD).toNumber());

        // Display results
        console.log('\nRouters by USD volume (descending):');
        console.log('-'.repeat(140));
        console.log(
            'Rank'.padEnd(6),
            'Router Address'.padEnd(44),
            'Label'.padEnd(30),
            'Category'.padEnd(12),
            'Volume (USD)'.padEnd(20),
            'Swaps'.padEnd(8),
            '% of Pool Volume'
        );
        console.log('-'.repeat(140));

        routerStats.forEach((stats, index) => {
            let line = `${index + 1}`.padEnd(6) +
                `${stats.router}`.padEnd(44) +
                `${stats.label}`.padEnd(30) +
                `${stats.category || 'Unknown'}`.padEnd(12) +
                `$${stats.volumeUSD.toFormat(4)}`.padEnd(20) +
                `${stats.swapCount}`.padEnd(8) +
                `${stats.percentOfPoolVolume.toFixed(2)}%`;

            // Color the line based on category
            if (stats.category === 'Retail') {
                console.log(chalk.green(line));
            } else if (stats.category === 'MEV Bot') {
                console.log(chalk.red(line));
            } else if (stats.category === 'Bunni Bot') {
                console.log(chalk.blue(line));
            } else {
                console.log(line);
            }
        });

        // Calculate volume by category
        const categoryStats = routerStats.reduce((acc, router) => {
            const category = router.category || 'Unknown';
            if (!acc[category]) {
                acc[category] = {
                    volumeUSD: new BigNumber(0),
                    swapCount: 0
                };
            }
            acc[category].volumeUSD = acc[category].volumeUSD.plus(router.volumeUSD);
            acc[category].swapCount += router.swapCount;
            return acc;
        }, {} as Record<string, { volumeUSD: BigNumber, swapCount: number }>);

        console.log('\nSummary:');
        console.log(`Total unique routers: ${routerStats.length}`);
        console.log(`Total swaps analyzed: ${swaps.length}`);

        console.log('\nVolume by Category:');
        console.log('-'.repeat(60));
        Object.entries(categoryStats).forEach(([category, stats]) => {
            const percentOfTotal = stats.volumeUSD.dividedBy(totalVolumeUSD).multipliedBy(100);
            const line = `${category}: $${stats.volumeUSD.toFormat(2)} (${percentOfTotal.toFixed(2)}%)`;

            if (category === 'Retail') {
                console.log(chalk.green(line));
            } else if (category === 'MEV Bot') {
                console.log(chalk.red(line));
            } else if (category === 'Bunni Bot') {
                console.log(chalk.blue(line));
            } else {
                console.log(line);
            }
        });

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Execute the script
getRouterStats(poolId)
    .catch(error => {
        console.error('Script execution failed:', error);
        process.exit(1);
    });

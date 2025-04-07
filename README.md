# Bunni Analysis

Various scripts for analyzing Bunni v2 data.

- [Markouts](./markouts.ts) - Calculate daily markouts for a given pool
  - Useful for analyzing LP profitability of a pool
  - Adjusts markouts by TVL to account for pool size
- [Volumes](./volumes.ts) - Calculate volume by router category for a given pool
  - Breaks down volume by retail, MEV bots, and Bunni am-AMM bots

To install dependencies:

```bash
bun install
```

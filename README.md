## Envio Indexer

# DEPLOYING

*Please refer to the [documentation website](https://docs.envio.dev) for a thorough guide on all [Envio](https://envio.dev) indexer features*

### Run

```bash
pnpm dev
```

Visit http://localhost:8080 to see the GraphQL Playground, local password is `testing`.

### Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

### Analytics entities

The indexer now maintains aggregated entities in addition to raw events:

- `GlobalStats` (singleton, id = `global`)
- `PlayerStats` (per wallet)
- `WeeklyStats` (per week)
- `PlayerWeeklyStats` (per wallet + week)
- `JackpotStats` (per jackpot nonce)

Example queries to start with in GraphQL Playground:

```graphql
query GlobalOverview {
  GlobalStats(where: { id: { _eq: "global" } }) {
    totalUniquePlayers
    keyPurchaseEvents
    keysPurchased
    keyPurchaseAmount
    weeklyClaimEvents
    weeklyClaimAmount
    jackpotClaimEvents
    jackpotClaimAmount
    totalClaimAmount
    netProfitAmount
  }
}
```

```graphql
query WalletOverview($wallet: String!) {
  PlayerStats(where: { wallet: { _eq: $wallet } }) {
    wallet
    keyPurchaseEvents
    keysPurchased
    keyPurchaseAmount
    weeklyClaimEvents
    weeklyClaimAmount
    jackpotClaimEvents
    jackpotClaimAmount
    totalClaimAmount
    netProfitAmount
  }
}
```

```graphql
query WeeklyOverview($week: BigInt!) {
  WeeklyStats(where: { week: { _eq: $week } }) {
    week
    weeklyClaimEvents
    weeklyClaimAmount
    uniqueClaimers
  }
}
```

```graphql
query WalletWeeklyOverview($wallet: String!) {
  PlayerWeeklyStats(where: { wallet: { _eq: $wallet } }, order_by: { week: asc }) {
    week
    weeklyClaimEvents
    weeklyClaimAmount
  }
}
```

```graphql
query JackpotOverview {
  JackpotStats(order_by: { nonce: desc }, limit: 20) {
    nonce
    jackpotClaimEvents
    jackpotClaimAmount
    uniqueClaimers
  }
}
```

### Pre-requisites

- [Node.js (use v18 or newer)](https://nodejs.org/en/download/current)
- [pnpm (use v8 or newer)](https://pnpm.io/installation)
- [Docker desktop](https://www.docker.com/products/docker-desktop/)

## MOG Indexer (Self-Hosted, Envio)

Base technique: alignement sur le pattern de deploiement de `och-indexer` puis `amigo-indexer` pour garder le meme flow self-host: `Docker + Postgres + Hasura + Envio indexer`.

### Cible indexee

- Reseau: Abstract mainnet (`chainId=2741`)
- `ClaimVault`: `0x40018Cbb1926dae72DCb315E89AAB7320A191D02`
- `KeyPurchase`: `0xBDE2483b242C266a97E39826b2B5B3c06FC02916`
- Start block: `38280364`

### Ce que contient ce repo

- `config.yaml`: config Envio pour les 2 contrats MOG
- `schema.graphql`: events bruts + entites d'agregation
- `src/EventHandlers.ts`: handlers et projections stateful
- `docker-compose.yml`: stack self-host (postgres + hasura + indexer)
- `Dockerfile` + `start.sh`: boot de l'indexer en conteneur
- `scripts/hasura/setup-public-tables.js`: permissions `select` Hasura pour le role public

### Entites d'analytics

L'indexer maintient des agregats en plus des events bruts:

- `GlobalStats` (singleton, id = `global`)
- `PlayerStats` (par wallet)
- `WeeklyStats` (par semaine)
- `PlayerWeeklyStats` (par wallet + semaine)
- `JackpotStats` (par nonce de jackpot)

`PlayerStats` essaye aussi d'enrichir le profil a la premiere rencontre d'un wallet via:

- `GET https://backend.portal.abs.xyz/api/user/address/{wallet}`

Si cet endpoint est protege dans ton runtime, renseigne `ABS_PROFILE_BEARER`.

### Variables d'environnement

Copie `.env.example` vers `.env` puis adapte les valeurs.

Variables principales:

- `ENVIO_API_TOKEN` (optionnel selon ton plan HyperSync)
- `ENVIO_POSTGRES_PASSWORD`
- `ENVIO_PG_USER`
- `ENVIO_PG_DATABASE`
- `HASURA_GRAPHQL_ADMIN_SECRET`
- `HASURA_GRAPHQL_UNAUTHORIZED_ROLE` (mettre `public` pour exposer en lecture sans secret)
- `HASURA_EXTERNAL_PORT`
- `INDEXER_EXTERNAL_PORT`
- `CONFIG_FILE`
- `LOG_LEVEL`
- `ABS_PROFILE_BEARER` (optionnel)

### Demarrage local (sans Docker)

```bash
pnpm install
pnpm codegen
pnpm build
pnpm dev
```

Visit `http://localhost:8080` to access Hasura/GraphQL locally.

### Demarrage self-host (Docker)

```bash
cp .env.example .env
# editer .env

pnpm docker:up
```

Commandes utiles:

```bash
pnpm docker:logs
pnpm docker:down
```

Endpoints:

- Hasura: `http://<host>:${HASURA_EXTERNAL_PORT:-8080}`
- Indexer endpoint: `http://<host>:${INDEXER_EXTERNAL_PORT:-8081}`

### Rendre les tables publiques (Hasura)

Le script ci-dessous cree les permissions `select` pour le role `public` sur toutes les tables trackees.

Depuis le serveur:

```bash
HASURA_ENDPOINT=http://127.0.0.1:8080/v1/metadata \
HASURA_ADMIN_SECRET=<TON_SECRET> \
pnpm setup-public
```

Ou via un domaine public:

```bash
HASURA_ENDPOINT=https://your-domain/v1/metadata \
HASURA_ADMIN_SECRET=<TON_SECRET> \
pnpm setup-public
```

Si tu relies l'exposition publique a `HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public`, redemarre ensuite Hasura:

```bash
docker compose up -d graphql-engine
```

Verification publique:

```bash
curl -s http://127.0.0.1:${HASURA_EXTERNAL_PORT:-8080}/v1/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"query { __typename }"}'
```

### Queries utiles

Vue globale:

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

Vue wallet:

```graphql
query WalletOverview($wallet: String!) {
  PlayerStats(where: { wallet: { _eq: $wallet } }) {
    wallet
    profileName
    profileImageUrl
    profileVerification
    profileFetchAttempted
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

Vue weekly:

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

Historique weekly par wallet:

```graphql
query WalletWeeklyOverview($wallet: String!) {
  PlayerWeeklyStats(where: { wallet: { _eq: $wallet } }, order_by: { week: asc }) {
    week
    weeklyClaimEvents
    weeklyClaimAmount
  }
}
```

Derniers jackpots:

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

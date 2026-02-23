/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import { S, createEffect } from "envio";
import {
  ClaimVault,
  ClaimVault_JackpotClaimed,
  ClaimVault_OwnershipHandoverCanceled,
  ClaimVault_OwnershipHandoverRequested,
  ClaimVault_OwnershipTransferred,
  ClaimVault_PauseStatusChanged,
  ClaimVault_SignerUpdated,
  ClaimVault_Upgraded,
  ClaimVault_WeeklyClaimed,
  KeyPurchase,
  KeyPurchase_ClaimsRecipientUpdated,
  KeyPurchase_FeeBpsUpdated,
  KeyPurchase_FeeRecipientUpdated,
  KeyPurchase_KeyPriceUpdated,
  KeyPurchase_KeysPurchased,
  KeyPurchase_OwnershipHandoverCanceled,
  KeyPurchase_OwnershipHandoverRequested,
  KeyPurchase_OwnershipTransferred,
  KeyPurchase_PauseStatusChanged,
  KeyPurchase_Upgraded,
  GlobalStats,
  JackpotPlayerSeen,
  JackpotStats,
  PlayerStats,
  PlayerWeeklyStats,
  WeeklyStats,
} from "generated";

const GLOBAL_STATS_ID = "global";
const ZERO = 0n;
const ABS_PROFILE_BY_WALLET_ENDPOINT = "https://backend.portal.abs.xyz/api/user/address";
const ABS_PROFILE_BEARER = process.env.ABS_PROFILE_BEARER ?? "";
const ABS_PROFILE_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

type BlockMeta = {
  number: number;
  timestamp: number;
};

type AbsProfile = {
  found: boolean;
  name: string;
  imageUrl: string;
  verification: string;
};

const asBigInt = (value: number): bigint => BigInt(value);

const eventId = (event: { chainId: number; block: { number: number }; logIndex: number }): string =>
  `${event.chainId}_${event.block.number}_${event.logIndex}`;

const normalizeWallet = (wallet: string): string => wallet.toLowerCase();

const playerWeeklyId = (wallet: string, week: bigint): string => `${wallet}_${week.toString()}`;
const jackpotId = (nonce: bigint): string => nonce.toString();
const jackpotPlayerSeenId = (nonce: bigint, wallet: string): string => `${nonce.toString()}_${wallet}`;
const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const asPositiveInteger = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
};

const resolveAvatarUrl = (user: any): string => {
  const override = asTrimmedString(user?.overrideProfilePictureUrl);
  if (override) return override;

  const season = asPositiveInteger(user?.avatar?.season);
  const tier = asPositiveInteger(user?.avatar?.tier);
  const key = asPositiveInteger(user?.avatar?.key);

  if (season && tier && key) {
    return `https://abstract-assets.abs.xyz/avatars/${season}-${tier}-${key}.png`;
  }

  return "";
};

const EMPTY_ABS_PROFILE: AbsProfile = {
  found: false,
  name: "",
  imageUrl: "",
  verification: "",
};

const absProfileEffect = createEffect(
  {
    name: "abs-profile-by-wallet",
    input: { wallet: S.string },
    output: {
      found: S.boolean,
      name: S.string,
      imageUrl: S.string,
      verification: S.string,
    },
    rateLimit: { calls: 10, per: "second" },
    cache: true,
  },
  async ({ input, context }): Promise<AbsProfile> => {
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "User-Agent": ABS_PROFILE_USER_AGENT,
      Referer: "https://portal.abs.xyz/",
    };
    if (ABS_PROFILE_BEARER) {
      headers.Authorization = `Bearer ${ABS_PROFILE_BEARER}`;
    }

    try {
      const response = await fetch(`${ABS_PROFILE_BY_WALLET_ENDPOINT}/${input.wallet}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
          context.cache = false;
        }
        return EMPTY_ABS_PROFILE;
      }

      const payload = (await response.json()) as any;
      const user = payload?.user;
      if (!user || typeof user !== "object") return EMPTY_ABS_PROFILE;

      const name = asTrimmedString(user.name);
      const imageUrl = resolveAvatarUrl(user);
      const verification = asTrimmedString(user.verification);

      if (!name && !imageUrl) return EMPTY_ABS_PROFILE;

      return {
        found: true,
        name,
        imageUrl,
        verification,
      };
    } catch {
      context.cache = false;
      return EMPTY_ABS_PROFILE;
    }
  }
);

const makeGlobalStats = (block: BlockMeta): GlobalStats => ({
  id: GLOBAL_STATS_ID,
  totalUniquePlayers: ZERO,
  keyPurchaseEvents: ZERO,
  keysPurchased: ZERO,
  keyPurchaseAmount: ZERO,
  weeklyClaimEvents: ZERO,
  weeklyClaimAmount: ZERO,
  jackpotClaimEvents: ZERO,
  jackpotClaimAmount: ZERO,
  totalClaimAmount: ZERO,
  netProfitAmount: ZERO,
  updatedAtBlock: asBigInt(block.number),
  updatedAtTimestamp: asBigInt(block.timestamp),
});

const makePlayerStats = (wallet: string, block: BlockMeta): PlayerStats => ({
  id: wallet,
  wallet,
  profileName: undefined,
  profileImageUrl: undefined,
  profileVerification: undefined,
  profileFetchAttempted: false,
  profileFetchedAtTimestamp: undefined,
  firstSeenBlock: asBigInt(block.number),
  firstSeenTimestamp: asBigInt(block.timestamp),
  updatedAtBlock: asBigInt(block.number),
  updatedAtTimestamp: asBigInt(block.timestamp),
  keyPurchaseEvents: ZERO,
  keysPurchased: ZERO,
  keyPurchaseAmount: ZERO,
  weeklyClaimEvents: ZERO,
  weeklyClaimAmount: ZERO,
  jackpotClaimEvents: ZERO,
  jackpotClaimAmount: ZERO,
  totalClaimAmount: ZERO,
  netProfitAmount: ZERO,
});

const makeWeeklyStats = (week: bigint, block: BlockMeta): WeeklyStats => ({
  id: week.toString(),
  week,
  weeklyClaimEvents: ZERO,
  weeklyClaimAmount: ZERO,
  uniqueClaimers: ZERO,
  updatedAtBlock: asBigInt(block.number),
  updatedAtTimestamp: asBigInt(block.timestamp),
});

const makePlayerWeeklyStats = (
  wallet: string,
  week: bigint,
  amount: bigint,
  block: BlockMeta
): PlayerWeeklyStats => ({
  id: playerWeeklyId(wallet, week),
  wallet,
  week,
  weeklyClaimEvents: 1n,
  weeklyClaimAmount: amount,
  firstClaimBlock: asBigInt(block.number),
  firstClaimTimestamp: asBigInt(block.timestamp),
  lastClaimBlock: asBigInt(block.number),
  lastClaimTimestamp: asBigInt(block.timestamp),
});

const makeJackpotStats = (nonce: bigint, block: BlockMeta): JackpotStats => ({
  id: jackpotId(nonce),
  nonce,
  jackpotClaimEvents: ZERO,
  jackpotClaimAmount: ZERO,
  uniqueClaimers: ZERO,
  updatedAtBlock: asBigInt(block.number),
  updatedAtTimestamp: asBigInt(block.timestamp),
});

const makeJackpotPlayerSeen = (nonce: bigint, wallet: string): JackpotPlayerSeen => ({
  id: jackpotPlayerSeenId(nonce, wallet),
  nonce,
  wallet,
});

const getOrCreateGlobalStats = async (context: any, block: BlockMeta): Promise<GlobalStats> =>
  (await context.GlobalStats.get(GLOBAL_STATS_ID)) ?? makeGlobalStats(block);

const getOrCreatePlayerStats = async (
  context: any,
  wallet: string,
  block: BlockMeta
): Promise<{ playerStats: PlayerStats; isNewPlayer: boolean }> => {
  const existing = await context.PlayerStats.get(wallet);
  if (existing) {
    return { playerStats: existing, isNewPlayer: false };
  }

  const createdPlayerStats = makePlayerStats(wallet, block);
  const profile = await context.effect(absProfileEffect, { wallet });

  return {
    playerStats: {
      ...createdPlayerStats,
      profileName: profile.name || undefined,
      profileImageUrl: profile.imageUrl || undefined,
      profileVerification: profile.verification || undefined,
      profileFetchAttempted: true,
      profileFetchedAtTimestamp: asBigInt(block.timestamp),
    },
    isNewPlayer: true,
  };
};

const getOrCreateWeeklyStats = async (context: any, week: bigint, block: BlockMeta): Promise<WeeklyStats> =>
  (await context.WeeklyStats.get(week.toString())) ?? makeWeeklyStats(week, block);

const getOrCreateJackpotStats = async (
  context: any,
  nonce: bigint,
  block: BlockMeta
): Promise<JackpotStats> => (await context.JackpotStats.get(jackpotId(nonce))) ?? makeJackpotStats(nonce, block);

ClaimVault.JackpotClaimed.handler(async ({ event, context }) => {
  const entity: ClaimVault_JackpotClaimed = {
    id: eventId(event),
    claimer: event.params.claimer,
    nonce: event.params.nonce,
    amount: event.params.amount,
  };

  context.ClaimVault_JackpotClaimed.set(entity);

  const wallet = normalizeWallet(event.params.claimer);
  const [globalStats, playerData, jackpotStats] = await Promise.all([
    getOrCreateGlobalStats(context, event.block),
    getOrCreatePlayerStats(context, wallet, event.block),
    getOrCreateJackpotStats(context, event.params.nonce, event.block),
  ]);
  const { playerStats, isNewPlayer } = playerData;

  const seenId = jackpotPlayerSeenId(event.params.nonce, wallet);
  const alreadySeen = await context.JackpotPlayerSeen.get(seenId);
  const uniqueBump = alreadySeen ? ZERO : 1n;

  const updatedGlobalStats: GlobalStats = {
    ...globalStats,
    totalUniquePlayers: globalStats.totalUniquePlayers + (isNewPlayer ? 1n : ZERO),
    jackpotClaimEvents: globalStats.jackpotClaimEvents + 1n,
    jackpotClaimAmount: globalStats.jackpotClaimAmount + event.params.amount,
    totalClaimAmount: globalStats.totalClaimAmount + event.params.amount,
    netProfitAmount: globalStats.netProfitAmount + event.params.amount,
    updatedAtBlock: asBigInt(event.block.number),
    updatedAtTimestamp: asBigInt(event.block.timestamp),
  };

  const updatedPlayerStats: PlayerStats = {
    ...playerStats,
    jackpotClaimEvents: playerStats.jackpotClaimEvents + 1n,
    jackpotClaimAmount: playerStats.jackpotClaimAmount + event.params.amount,
    totalClaimAmount: playerStats.totalClaimAmount + event.params.amount,
    netProfitAmount: playerStats.netProfitAmount + event.params.amount,
    updatedAtBlock: asBigInt(event.block.number),
    updatedAtTimestamp: asBigInt(event.block.timestamp),
  };

  const updatedJackpotStats: JackpotStats = {
    ...jackpotStats,
    jackpotClaimEvents: jackpotStats.jackpotClaimEvents + 1n,
    jackpotClaimAmount: jackpotStats.jackpotClaimAmount + event.params.amount,
    uniqueClaimers: jackpotStats.uniqueClaimers + uniqueBump,
    updatedAtBlock: asBigInt(event.block.number),
    updatedAtTimestamp: asBigInt(event.block.timestamp),
  };

  context.GlobalStats.set(updatedGlobalStats);
  context.PlayerStats.set(updatedPlayerStats);
  context.JackpotStats.set(updatedJackpotStats);

  if (!alreadySeen) {
    context.JackpotPlayerSeen.set(makeJackpotPlayerSeen(event.params.nonce, wallet));
  }
});

ClaimVault.OwnershipHandoverCanceled.handler(async ({ event, context }) => {
  const entity: ClaimVault_OwnershipHandoverCanceled = {
    id: eventId(event),
    pendingOwner: event.params.pendingOwner,
  };

  context.ClaimVault_OwnershipHandoverCanceled.set(entity);
});

ClaimVault.OwnershipHandoverRequested.handler(async ({ event, context }) => {
  const entity: ClaimVault_OwnershipHandoverRequested = {
    id: eventId(event),
    pendingOwner: event.params.pendingOwner,
  };

  context.ClaimVault_OwnershipHandoverRequested.set(entity);
});

ClaimVault.OwnershipTransferred.handler(async ({ event, context }) => {
  const entity: ClaimVault_OwnershipTransferred = {
    id: eventId(event),
    oldOwner: event.params.oldOwner,
    newOwner: event.params.newOwner,
  };

  context.ClaimVault_OwnershipTransferred.set(entity);
});

ClaimVault.PauseStatusChanged.handler(async ({ event, context }) => {
  const entity: ClaimVault_PauseStatusChanged = {
    id: eventId(event),
    paused: event.params.paused,
  };

  context.ClaimVault_PauseStatusChanged.set(entity);
});

ClaimVault.SignerUpdated.handler(async ({ event, context }) => {
  const entity: ClaimVault_SignerUpdated = {
    id: eventId(event),
    oldSigner: event.params.oldSigner,
    newSigner: event.params.newSigner,
  };

  context.ClaimVault_SignerUpdated.set(entity);
});

ClaimVault.Upgraded.handler(async ({ event, context }) => {
  const entity: ClaimVault_Upgraded = {
    id: eventId(event),
    implementation: event.params.implementation,
  };

  context.ClaimVault_Upgraded.set(entity);
});

ClaimVault.WeeklyClaimed.handler(async ({ event, context }) => {
  const entity: ClaimVault_WeeklyClaimed = {
    id: eventId(event),
    claimer: event.params.claimer,
    week: event.params.week,
    amount: event.params.amount,
  };

  context.ClaimVault_WeeklyClaimed.set(entity);

  const wallet = normalizeWallet(event.params.claimer);
  const [globalStats, playerData, weeklyStats] = await Promise.all([
    getOrCreateGlobalStats(context, event.block),
    getOrCreatePlayerStats(context, wallet, event.block),
    getOrCreateWeeklyStats(context, event.params.week, event.block),
  ]);
  const { playerStats, isNewPlayer } = playerData;

  const playerWeekKey = playerWeeklyId(wallet, event.params.week);
  const existingPlayerWeeklyStats = await context.PlayerWeeklyStats.get(playerWeekKey);

  const uniqueWeeklyClaimerBump = existingPlayerWeeklyStats ? ZERO : 1n;
  const updatedPlayerWeeklyStats: PlayerWeeklyStats = existingPlayerWeeklyStats
    ? {
        ...existingPlayerWeeklyStats,
        weeklyClaimEvents: existingPlayerWeeklyStats.weeklyClaimEvents + 1n,
        weeklyClaimAmount: existingPlayerWeeklyStats.weeklyClaimAmount + event.params.amount,
        lastClaimBlock: asBigInt(event.block.number),
        lastClaimTimestamp: asBigInt(event.block.timestamp),
      }
    : makePlayerWeeklyStats(wallet, event.params.week, event.params.amount, event.block);

  const updatedGlobalStats: GlobalStats = {
    ...globalStats,
    totalUniquePlayers: globalStats.totalUniquePlayers + (isNewPlayer ? 1n : ZERO),
    weeklyClaimEvents: globalStats.weeklyClaimEvents + 1n,
    weeklyClaimAmount: globalStats.weeklyClaimAmount + event.params.amount,
    totalClaimAmount: globalStats.totalClaimAmount + event.params.amount,
    netProfitAmount: globalStats.netProfitAmount + event.params.amount,
    updatedAtBlock: asBigInt(event.block.number),
    updatedAtTimestamp: asBigInt(event.block.timestamp),
  };

  const updatedPlayerStats: PlayerStats = {
    ...playerStats,
    weeklyClaimEvents: playerStats.weeklyClaimEvents + 1n,
    weeklyClaimAmount: playerStats.weeklyClaimAmount + event.params.amount,
    totalClaimAmount: playerStats.totalClaimAmount + event.params.amount,
    netProfitAmount: playerStats.netProfitAmount + event.params.amount,
    updatedAtBlock: asBigInt(event.block.number),
    updatedAtTimestamp: asBigInt(event.block.timestamp),
  };

  const updatedWeeklyStats: WeeklyStats = {
    ...weeklyStats,
    weeklyClaimEvents: weeklyStats.weeklyClaimEvents + 1n,
    weeklyClaimAmount: weeklyStats.weeklyClaimAmount + event.params.amount,
    uniqueClaimers: weeklyStats.uniqueClaimers + uniqueWeeklyClaimerBump,
    updatedAtBlock: asBigInt(event.block.number),
    updatedAtTimestamp: asBigInt(event.block.timestamp),
  };

  context.GlobalStats.set(updatedGlobalStats);
  context.PlayerStats.set(updatedPlayerStats);
  context.WeeklyStats.set(updatedWeeklyStats);
  context.PlayerWeeklyStats.set(updatedPlayerWeeklyStats);
});

KeyPurchase.ClaimsRecipientUpdated.handler(async ({ event, context }) => {
  const entity: KeyPurchase_ClaimsRecipientUpdated = {
    id: eventId(event),
    oldClaimsRecipient: event.params.oldClaimsRecipient,
    newClaimsRecipient: event.params.newClaimsRecipient,
  };

  context.KeyPurchase_ClaimsRecipientUpdated.set(entity);
});

KeyPurchase.FeeBpsUpdated.handler(async ({ event, context }) => {
  const entity: KeyPurchase_FeeBpsUpdated = {
    id: eventId(event),
    oldFeeBps: event.params.oldFeeBps,
    newFeeBps: event.params.newFeeBps,
  };

  context.KeyPurchase_FeeBpsUpdated.set(entity);
});

KeyPurchase.FeeRecipientUpdated.handler(async ({ event, context }) => {
  const entity: KeyPurchase_FeeRecipientUpdated = {
    id: eventId(event),
    oldFeeRecipient: event.params.oldFeeRecipient,
    newFeeRecipient: event.params.newFeeRecipient,
  };

  context.KeyPurchase_FeeRecipientUpdated.set(entity);
});

KeyPurchase.KeyPriceUpdated.handler(async ({ event, context }) => {
  const entity: KeyPurchase_KeyPriceUpdated = {
    id: eventId(event),
    oldPrice: event.params.oldPrice,
    newPrice: event.params.newPrice,
  };

  context.KeyPurchase_KeyPriceUpdated.set(entity);
});

KeyPurchase.KeysPurchased.handler(async ({ event, context }) => {
  const entity: KeyPurchase_KeysPurchased = {
    id: eventId(event),
    buyer: event.params.buyer,
    quantity: event.params.quantity,
    pricePerKey: event.params.pricePerKey,
    totalPaid: event.params.totalPaid,
  };

  context.KeyPurchase_KeysPurchased.set(entity);

  const wallet = normalizeWallet(event.params.buyer);
  const [globalStats, playerData] = await Promise.all([
    getOrCreateGlobalStats(context, event.block),
    getOrCreatePlayerStats(context, wallet, event.block),
  ]);
  const { playerStats, isNewPlayer } = playerData;

  const updatedGlobalStats: GlobalStats = {
    ...globalStats,
    totalUniquePlayers: globalStats.totalUniquePlayers + (isNewPlayer ? 1n : ZERO),
    keyPurchaseEvents: globalStats.keyPurchaseEvents + 1n,
    keysPurchased: globalStats.keysPurchased + event.params.quantity,
    keyPurchaseAmount: globalStats.keyPurchaseAmount + event.params.totalPaid,
    netProfitAmount: globalStats.netProfitAmount - event.params.totalPaid,
    updatedAtBlock: asBigInt(event.block.number),
    updatedAtTimestamp: asBigInt(event.block.timestamp),
  };

  const updatedPlayerStats: PlayerStats = {
    ...playerStats,
    keyPurchaseEvents: playerStats.keyPurchaseEvents + 1n,
    keysPurchased: playerStats.keysPurchased + event.params.quantity,
    keyPurchaseAmount: playerStats.keyPurchaseAmount + event.params.totalPaid,
    netProfitAmount: playerStats.netProfitAmount - event.params.totalPaid,
    updatedAtBlock: asBigInt(event.block.number),
    updatedAtTimestamp: asBigInt(event.block.timestamp),
  };

  context.GlobalStats.set(updatedGlobalStats);
  context.PlayerStats.set(updatedPlayerStats);
});

KeyPurchase.OwnershipHandoverCanceled.handler(async ({ event, context }) => {
  const entity: KeyPurchase_OwnershipHandoverCanceled = {
    id: eventId(event),
    pendingOwner: event.params.pendingOwner,
  };

  context.KeyPurchase_OwnershipHandoverCanceled.set(entity);
});

KeyPurchase.OwnershipHandoverRequested.handler(async ({ event, context }) => {
  const entity: KeyPurchase_OwnershipHandoverRequested = {
    id: eventId(event),
    pendingOwner: event.params.pendingOwner,
  };

  context.KeyPurchase_OwnershipHandoverRequested.set(entity);
});

KeyPurchase.OwnershipTransferred.handler(async ({ event, context }) => {
  const entity: KeyPurchase_OwnershipTransferred = {
    id: eventId(event),
    oldOwner: event.params.oldOwner,
    newOwner: event.params.newOwner,
  };

  context.KeyPurchase_OwnershipTransferred.set(entity);
});

KeyPurchase.PauseStatusChanged.handler(async ({ event, context }) => {
  const entity: KeyPurchase_PauseStatusChanged = {
    id: eventId(event),
    paused: event.params.paused,
  };

  context.KeyPurchase_PauseStatusChanged.set(entity);
});

KeyPurchase.Upgraded.handler(async ({ event, context }) => {
  const entity: KeyPurchase_Upgraded = {
    id: eventId(event),
    implementation: event.params.implementation,
  };

  context.KeyPurchase_Upgraded.set(entity);
});

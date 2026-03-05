// src/data/dynamic/logic/abilityFormatter.ts

export interface ActivityLogEntry {
  action: string;
  timestamp: number;
  parameters: Record<string, unknown>;
}

export const PET_ABILITY_ACTIONS = [
  'CoinFinderI', 'CoinFinderII', 'CoinFinderIII',
  'SeedFinderI', 'SeedFinderII', 'SeedFinderIII', 'SeedFinderIV',
  'HungerRestore', 'HungerRestoreII',
  'DoubleHarvest', 'DoubleHatch',
  'ProduceEater',
  'PetHatchSizeBoost', 'PetHatchSizeBoostII',
  'PetAgeBoost', 'PetAgeBoostII',
  'PetRefund', 'PetRefundII',
  'ProduceRefund',
  'SellBoostI', 'SellBoostII', 'SellBoostIII', 'SellBoostIV',
  'GoldGranter', 'RainbowGranter', 'RainDance',
  'PetXpBoost', 'PetXpBoostII',
  'EggGrowthBoost', 'EggGrowthBoostII_NEW', 'EggGrowthBoostII',
  'PlantGrowthBoost', 'PlantGrowthBoostII',
  'ProduceScaleBoost', 'ProduceScaleBoostII',
] as const;

export type PetAbilityAction = (typeof PET_ABILITY_ACTIONS)[number];

export function isPetAbilityAction(action: string): action is PetAbilityAction {
  return PET_ABILITY_ACTIONS.includes(action as PetAbilityAction);
}

export function filterPetAbilityLogs(logs: ActivityLogEntry[]): ActivityLogEntry[] {
  return logs.filter((log) => isPetAbilityAction(log.action));
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function getPetName(pet: Record<string, unknown>): string {
  return (pet?.name as string) || (pet?.petSpecies as string) || 'Unknown Pet';
}

export function formatAbilityLog(log: ActivityLogEntry): string {
  const { action, parameters } = log;
  const params = parameters as Record<string, unknown>;

  switch (action) {
    case 'CoinFinderI':
    case 'CoinFinderII':
    case 'CoinFinderIII':
      return `Found ${params.coinsFound || 0} coins`;

    case 'SeedFinderI':
    case 'SeedFinderII':
    case 'SeedFinderIII':
    case 'SeedFinderIV':
      return `Found 1x ${params.speciesId || 'Unknown'} seed`;

    case 'HungerRestore':
    case 'HungerRestoreII': {
      const targetName = getPetName(params.targetPet as Record<string, unknown>);
      const amount = params.hungerRestoreAmount || 0;
      const pet = params.pet as Record<string, unknown> | undefined;
      const targetPet = params.targetPet as Record<string, unknown> | undefined;
      const isSelf = pet?.id === targetPet?.id;
      return `Restored ${amount} hunger to ${isSelf ? 'itself' : targetName}`;
    }

    case 'DoubleHarvest': {
      const crop = params.harvestedCrop as Record<string, unknown> | undefined;
      return `Double harvested ${crop?.species || 'Unknown'}`;
    }

    case 'DoubleHatch': {
      const extra = params.extraPet as Record<string, unknown> | undefined;
      return `Double hatched ${extra?.petSpecies || 'Unknown'}`;
    }

    case 'ProduceEater': {
      const slot = params.growSlot as Record<string, unknown> | undefined;
      return `Ate ${slot?.species || 'Unknown'} for ${params.sellPrice || 0} coins`;
    }

    case 'PetHatchSizeBoost':
    case 'PetHatchSizeBoostII': {
      const targetName = getPetName(params.targetPet as Record<string, unknown>);
      const increase = Number(params.strengthIncrease) || 0;
      return `Boosted ${targetName}'s size by +${increase.toFixed(0)}`;
    }

    case 'PetAgeBoost':
    case 'PetAgeBoostII': {
      const targetName = getPetName(params.targetPet as Record<string, unknown>);
      return `Gave +${params.bonusXp || 0} XP to ${targetName}`;
    }

    case 'PetRefund':
    case 'PetRefundII':
      return `Refunded 1x ${params.eggId || 'Unknown Egg'}`;

    case 'ProduceRefund': {
      const crops = params.cropsRefunded as unknown[];
      const num = Array.isArray(crops) ? crops.length : 0;
      return `Refunded ${num} ${num === 1 ? 'crop' : 'crops'}`;
    }

    case 'SellBoostI':
    case 'SellBoostII':
    case 'SellBoostIII':
    case 'SellBoostIV':
      return `Gave +${params.bonusCoins || 0} bonus coins`;

    case 'GoldGranter':
    case 'RainbowGranter':
    case 'RainDance': {
      const slot = params.growSlot as Record<string, unknown> | undefined;
      return `Made ${slot?.species || 'Unknown'} turn ${params.mutation || 'Unknown'}`;
    }

    case 'PetXpBoost':
    case 'PetXpBoostII': {
      const affected = params.petsAffected as unknown[];
      const num = Array.isArray(affected) ? affected.length : 0;
      return `Gave +${params.bonusXp || 0} XP to ${num} ${num === 1 ? 'pet' : 'pets'}`;
    }

    case 'EggGrowthBoost':
    case 'EggGrowthBoostII_NEW':
    case 'EggGrowthBoostII': {
      const eggs = params.eggsAffected as unknown[];
      const num = Array.isArray(eggs) ? eggs.length : 0;
      const time = formatTime(Number(params.secondsReduced) || 0);
      return `Reduced ${num} ${num === 1 ? 'egg' : 'eggs'} growth by ${time}`;
    }

    case 'PlantGrowthBoost':
    case 'PlantGrowthBoostII': {
      const num = Number(params.numPlantsAffected) || 0;
      const time = formatTime(Number(params.secondsReduced) || 0);
      return `Reduced ${num} ${num === 1 ? 'plant' : 'plants'} growth by ${time}`;
    }

    case 'ProduceScaleBoost':
    case 'ProduceScaleBoostII': {
      const pct = Number(params.scaleIncreasePercentage) || 0;
      const num = Number(params.numPlantsAffected) || 0;
      return `Boosted ${num} ${num === 1 ? 'crop' : 'crops'} size by +${pct.toFixed(0)}%`;
    }

    default:
      return `Unknown ability: ${action}`;
  }
}

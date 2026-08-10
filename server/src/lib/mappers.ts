import type { CardCache, CollectionItem, Scan } from "@prisma/client";
import type { CardIdentification, CollectionItemDTO, GradingResult, PricingResult, ScanRecordDTO } from "@pokedex-vault/shared";

export function cardCacheToIdentification(card: CardCache, overrides: Partial<CardIdentification> = {}): CardIdentification {
  return {
    confident: true,
    confidenceNote: null,
    name: card.name,
    set: card.set,
    setId: card.setId,
    cardNumber: card.cardNumber,
    totalInSet: card.totalInSet,
    rarity: card.rarity,
    cardType: card.cardType,
    language: "English",
    holoType: "Non-Holo",
    variant: null,
    isPromo: false,
    isFirstEditionOrShadowless: false,
    pokemonTcgIoId: card.pokemonTcgIoId,
    imageUrl: card.imageUrl,
    ...overrides,
  };
}

export function collectionItemToDTO(item: CollectionItem & { card: CardCache; scans?: Scan[] }): CollectionItemDTO {
  const identification = cardCacheToIdentification(item.card, {
    language: item.language as CardIdentification["language"],
    holoType: item.holoType as CardIdentification["holoType"],
    variant: item.variant,
    isPromo: item.isPromo,
    isFirstEditionOrShadowless: item.isFirstEdition,
  });

  return {
    id: item.id,
    card: identification,
    frontImageUrl: item.frontImageUrl,
    backImageUrl: item.backImageUrl,
    latestGrade: item.latestGradeJson ? (JSON.parse(item.latestGradeJson) as GradingResult) : null,
    latestPricing: item.latestPriceJson ? (JSON.parse(item.latestPriceJson) as PricingResult) : null,
    condition: item.condition as CollectionItemDTO["condition"],
    gradingCompany: item.gradingCompany as CollectionItemDTO["gradingCompany"],
    certNumber: item.certNumber,
    purchasePrice: item.purchasePrice,
    purchaseDate: item.purchaseDate ? item.purchaseDate.toISOString() : null,
    notes: item.notes,
    dateScanned: item.dateScanned.toISOString(),
    scanHistoryCount: item.scans?.length ?? 0,
  };
}

export function scanToDTO(scan: Scan): ScanRecordDTO {
  return {
    id: scan.id,
    createdAt: scan.createdAt.toISOString(),
    overallGrade: scan.overallGrade,
    subgrades: (JSON.parse(scan.gradingJson) as GradingResult).subgrades,
    frontImageUrl: scan.frontImageUrl,
    backImageUrl: scan.backImageUrl,
  };
}

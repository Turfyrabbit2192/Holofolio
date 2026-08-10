import { Router } from "express";
import { z } from "zod";
import type { CardIdentification, GradingResult, PricingResult } from "@pokedex-vault/shared";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { collectionItemToDTO, scanToDTO } from "../lib/mappers";

export const collectionRouter = Router();
collectionRouter.use(requireAuth);

async function upsertCardCache(identification: CardIdentification) {
  if (identification.pokemonTcgIoId) {
    const existing = await prisma.cardCache.findUnique({ where: { pokemonTcgIoId: identification.pokemonTcgIoId } });
    if (existing) return existing;
  }
  const existingByFields = await prisma.cardCache.findFirst({
    where: { name: identification.name, set: identification.set, cardNumber: identification.cardNumber },
  });
  if (existingByFields) return existingByFields;

  return prisma.cardCache.create({
    data: {
      pokemonTcgIoId: identification.pokemonTcgIoId,
      name: identification.name,
      set: identification.set,
      setId: identification.setId,
      cardNumber: identification.cardNumber,
      totalInSet: identification.totalInSet,
      rarity: identification.rarity,
      cardType: identification.cardType,
      imageUrl: identification.imageUrl,
    },
  });
}

const createSchema = z.object({
  identification: z.object({
    name: z.string(),
    set: z.string(),
    setId: z.string().nullable().optional(),
    cardNumber: z.string(),
    totalInSet: z.string().nullable().optional(),
    rarity: z.string(),
    cardType: z.string(),
    language: z.string(),
    holoType: z.string(),
    variant: z.string().nullable().optional(),
    isPromo: z.boolean(),
    isFirstEditionOrShadowless: z.boolean(),
    pokemonTcgIoId: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
  }),
  grading: z.any(),
  pricing: z.any(),
  frontImageUrl: z.string(),
  backImageUrl: z.string(),
  condition: z.enum(["Raw", "Graded"]),
  gradingCompany: z.enum(["PSA", "TAG", "BGS", "CGC"]).nullable().optional(),
  certNumber: z.string().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

collectionRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const body = parsed.data;

  const card = await upsertCardCache(body.identification as CardIdentification);

  const item = await prisma.collectionItem.create({
    data: {
      userId: req.userId!,
      cardId: card.id,
      frontImageUrl: body.frontImageUrl,
      backImageUrl: body.backImageUrl,
      condition: body.condition,
      gradingCompany: body.gradingCompany ?? null,
      certNumber: body.certNumber ?? null,
      language: body.identification.language,
      holoType: body.identification.holoType,
      variant: body.identification.variant ?? null,
      isPromo: body.identification.isPromo,
      isFirstEdition: body.identification.isFirstEditionOrShadowless,
      purchasePrice: body.purchasePrice ?? null,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
      notes: body.notes ?? null,
      latestGradeJson: JSON.stringify(body.grading),
      latestPriceJson: JSON.stringify(body.pricing),
    },
  });

  const grading = body.grading as GradingResult;
  const pricing = body.pricing as PricingResult;

  await prisma.scan.create({
    data: {
      collectionItemId: item.id,
      cardId: card.id,
      frontImageUrl: body.frontImageUrl,
      backImageUrl: body.backImageUrl,
      frontQualityJson: "{}",
      backQualityJson: "{}",
      identificationJson: JSON.stringify(body.identification),
      gradingJson: JSON.stringify(grading),
      pricingJson: JSON.stringify(pricing),
      overallGrade: grading.aiOverallGrade,
    },
  });

  if (pricing.estimatedValue !== null) {
    await prisma.priceSnapshot.create({
      data: { collectionItemId: item.id, estimatedValue: pricing.estimatedValue },
    });
  }

  const full = await prisma.collectionItem.findUniqueOrThrow({ where: { id: item.id }, include: { card: true, scans: true } });
  res.status(201).json(collectionItemToDTO(full));
});

collectionRouter.get("/", async (req: AuthedRequest, res) => {
  const items = await prisma.collectionItem.findMany({
    where: { userId: req.userId! },
    include: { card: true, scans: true },
    orderBy: { dateScanned: "desc" },
  });
  let dtos = items.map(collectionItemToDTO);

  const { q, rarity, minGrade, maxGrade, minPrice, maxPrice, gradingCompany, condition, sort } = req.query;

  if (typeof q === "string" && q.trim()) {
    const needle = q.trim().toLowerCase();
    dtos = dtos.filter(
      (d) =>
        d.card.name.toLowerCase().includes(needle) ||
        d.card.set.toLowerCase().includes(needle) ||
        d.card.cardNumber.toLowerCase().includes(needle)
    );
  }
  if (typeof rarity === "string" && rarity.trim()) {
    dtos = dtos.filter((d) => d.card.rarity.toLowerCase() === rarity.toLowerCase());
  }
  if (typeof condition === "string" && (condition === "Raw" || condition === "Graded")) {
    dtos = dtos.filter((d) => d.condition === condition);
  }
  if (typeof gradingCompany === "string" && gradingCompany.trim()) {
    dtos = dtos.filter((d) => d.gradingCompany === gradingCompany);
  }
  if (typeof minGrade === "string") {
    const v = Number(minGrade);
    if (!Number.isNaN(v)) dtos = dtos.filter((d) => (d.latestGrade?.aiOverallGrade ?? 0) >= v);
  }
  if (typeof maxGrade === "string") {
    const v = Number(maxGrade);
    if (!Number.isNaN(v)) dtos = dtos.filter((d) => (d.latestGrade?.aiOverallGrade ?? 10) <= v);
  }
  if (typeof minPrice === "string") {
    const v = Number(minPrice);
    if (!Number.isNaN(v)) dtos = dtos.filter((d) => (d.latestPricing?.estimatedValue ?? 0) >= v);
  }
  if (typeof maxPrice === "string") {
    const v = Number(maxPrice);
    if (!Number.isNaN(v)) dtos = dtos.filter((d) => (d.latestPricing?.estimatedValue ?? Infinity) <= v);
  }

  const sortKey = typeof sort === "string" ? sort : "recent";
  const byValue = (d: (typeof dtos)[number]) => d.latestPricing?.estimatedValue ?? 0;
  const byGrade = (d: (typeof dtos)[number]) => d.latestGrade?.aiOverallGrade ?? 0;
  switch (sortKey) {
    case "value_desc":
      dtos.sort((a, b) => byValue(b) - byValue(a));
      break;
    case "value_asc":
      dtos.sort((a, b) => byValue(a) - byValue(b));
      break;
    case "grade_desc":
      dtos.sort((a, b) => byGrade(b) - byGrade(a));
      break;
    case "grade_asc":
      dtos.sort((a, b) => byGrade(a) - byGrade(b));
      break;
    case "oldest":
      dtos.sort((a, b) => new Date(a.dateScanned).getTime() - new Date(b.dateScanned).getTime());
      break;
    case "alpha":
      dtos.sort((a, b) => a.card.name.localeCompare(b.card.name));
      break;
    case "recent":
    default:
      dtos.sort((a, b) => new Date(b.dateScanned).getTime() - new Date(a.dateScanned).getTime());
  }

  res.json({ items: dtos });
});

collectionRouter.get("/:id", async (req: AuthedRequest, res) => {
  const item = await prisma.collectionItem.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { card: true, scans: { orderBy: { createdAt: "asc" } } },
  });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json({
    item: collectionItemToDTO(item),
    scanHistory: item.scans.map(scanToDTO),
  });
});

const patchSchema = z.object({
  notes: z.string().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  condition: z.enum(["Raw", "Graded"]).optional(),
  gradingCompany: z.enum(["PSA", "TAG", "BGS", "CGC"]).nullable().optional(),
  certNumber: z.string().nullable().optional(),
  language: z.string().optional(),
  holoType: z.string().optional(),
  variant: z.string().nullable().optional(),
  isPromo: z.boolean().optional(),
  isFirstEditionOrShadowless: z.boolean().optional(),
});

collectionRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const existing = await prisma.collectionItem.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const data = parsed.data;
  const updated = await prisma.collectionItem.update({
    where: { id: existing.id },
    data: {
      notes: data.notes,
      purchasePrice: data.purchasePrice,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : data.purchaseDate === null ? null : undefined,
      condition: data.condition,
      gradingCompany: data.gradingCompany,
      certNumber: data.certNumber,
      language: data.language,
      holoType: data.holoType,
      variant: data.variant,
      isPromo: data.isPromo,
      isFirstEdition: data.isFirstEditionOrShadowless,
    },
    include: { card: true, scans: true },
  });
  res.json(collectionItemToDTO(updated));
});

collectionRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.collectionItem.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.priceSnapshot.deleteMany({ where: { collectionItemId: existing.id } });
  await prisma.scan.deleteMany({ where: { collectionItemId: existing.id } });
  await prisma.collectionItem.delete({ where: { id: existing.id } });
  res.status(204).send();
});

const rescanSchema = z.object({
  identification: createSchema.shape.identification,
  grading: z.any(),
  pricing: z.any(),
  frontImageUrl: z.string(),
  backImageUrl: z.string(),
});

collectionRouter.post("/:id/rescan", async (req: AuthedRequest, res) => {
  const parsed = rescanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const existing = await prisma.collectionItem.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const body = parsed.data;
  const grading = body.grading as GradingResult;
  const pricing = body.pricing as PricingResult;

  await prisma.scan.create({
    data: {
      collectionItemId: existing.id,
      cardId: existing.cardId,
      frontImageUrl: body.frontImageUrl,
      backImageUrl: body.backImageUrl,
      frontQualityJson: "{}",
      backQualityJson: "{}",
      identificationJson: JSON.stringify(body.identification),
      gradingJson: JSON.stringify(grading),
      pricingJson: JSON.stringify(pricing),
      overallGrade: grading.aiOverallGrade,
    },
  });

  const updated = await prisma.collectionItem.update({
    where: { id: existing.id },
    data: {
      frontImageUrl: body.frontImageUrl,
      backImageUrl: body.backImageUrl,
      latestGradeJson: JSON.stringify(grading),
      latestPriceJson: JSON.stringify(pricing),
      dateScanned: new Date(),
    },
    include: { card: true, scans: true },
  });

  if (pricing.estimatedValue !== null) {
    await prisma.priceSnapshot.create({ data: { collectionItemId: existing.id, estimatedValue: pricing.estimatedValue } });
  }

  res.json(collectionItemToDTO(updated));
});

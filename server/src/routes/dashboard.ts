import { Router } from "express";
import type { DashboardStats, GradingCompany } from "@pokedex-vault/shared";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { collectionItemToDTO } from "../lib/mappers";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const items = await prisma.collectionItem.findMany({
    where: { userId },
    include: { card: true, scans: true },
  });
  const dtos = items.map(collectionItemToDTO);

  const totalCards = dtos.length;
  const values = dtos.map((d) => d.latestPricing?.estimatedValue ?? d.purchasePrice ?? 0);
  const collectionValue = Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

  const grades = dtos.map((d) => d.latestGrade?.aiOverallGrade).filter((g): g is number => typeof g === "number");
  const averageGrade = grades.length ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : 0;

  let highestValueCard: DashboardStats["highestValueCard"] = null;
  dtos.forEach((d, i) => {
    const v = values[i];
    if (v > 0 && (!highestValueCard || v > highestValueCard.value)) {
      highestValueCard = { name: d.card.name, value: v };
    }
  });

  const cardsScanned = await prisma.scan.count({ where: { collectionItem: { userId } } });

  const gradeDistribution: Record<string, number> = {};
  grades.forEach((g) => {
    const bucket = String(Math.round(g));
    gradeDistribution[bucket] = (gradeDistribution[bucket] ?? 0) + 1;
  });

  const rawVsGraded = { raw: dtos.filter((d) => d.condition === "Raw").length, graded: dtos.filter((d) => d.condition === "Graded").length };

  const companyDistribution: Record<GradingCompany, number> = { PSA: 0, TAG: 0, BGS: 0, CGC: 0 };
  dtos.forEach((d) => {
    if (d.gradingCompany) companyDistribution[d.gradingCompany]++;
  });

  const setsCollected = new Set(dtos.map((d) => d.card.set)).size;

  // Portfolio value over time, built from real PriceSnapshot rows (written whenever a card is added or rescanned).
  const snapshots = await prisma.priceSnapshot.findMany({
    where: { collectionItem: { userId } },
    orderBy: { createdAt: "asc" },
  });
  const dateKeys = Array.from(new Set(snapshots.map((s) => s.createdAt.toISOString().slice(0, 10)))).sort();
  const latestPerItemAsOf = (dateKey: string) => {
    const cutoff = new Date(`${dateKey}T23:59:59.999Z`).getTime();
    const latest = new Map<string, number>();
    for (const s of snapshots) {
      if (s.createdAt.getTime() <= cutoff) latest.set(s.collectionItemId, s.estimatedValue);
    }
    return Array.from(latest.values()).reduce((a, b) => a + b, 0);
  };
  const valueOverTime = dateKeys.map((date) => ({ date, value: Math.round(latestPerItemAsOf(date) * 100) / 100 }));

  let valueChangePct30d: number | null = null;
  if (valueOverTime.length > 0) {
    const now = Date.now();
    const cutoff30 = now - 30 * 24 * 60 * 60 * 1000;
    const past = valueOverTime.filter((p) => new Date(p.date).getTime() <= cutoff30);
    const baseline = past.length ? past[past.length - 1].value : valueOverTime[0].value;
    const current = collectionValue;
    if (baseline > 0) {
      valueChangePct30d = Math.round(((current - baseline) / baseline) * 1000) / 10;
    }
  }

  const stats: DashboardStats = {
    totalCards,
    collectionValue,
    averageGrade,
    highestValueCard,
    cardsScanned,
    valueChangePct30d,
    gradeDistribution,
    rawVsGraded,
    companyDistribution,
    setsCollected,
    valueOverTime,
  };

  res.json(stats);
});

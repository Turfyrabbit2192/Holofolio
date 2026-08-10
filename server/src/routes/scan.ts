import { Router } from "express";
import multer from "multer";
import type { CardIdentification, GradingResult, PricingResult } from "@pokedex-vault/shared";
import { assessImageQuality } from "../lib/imageQuality";
import { straightenAndCrop } from "../lib/cardCrop";
import { identifyCardWithVision } from "../lib/claudeVision";
import { findBestMatch } from "../lib/pokemonTcgApi";
import { runGradingPipeline } from "../lib/grading";
import { addEbayGradedComp, applyGradeValuation, buildPricingResult } from "../lib/pricing/aggregator";
import { saveImage } from "../lib/storage";
import { requireAuth } from "../middleware/auth";

export const scanRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

scanRouter.post("/quality-check", requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  try {
    const report = await assessImageQuality(req.file.buffer);
    res.json(report);
  } catch (err) {
    console.error("quality-check failed", err);
    res.status(500).json({ error: "Failed to analyze image quality" });
  }
});

export interface ScanAnalyzeResponse {
  identification: CardIdentification;
  grading: GradingResult;
  pricing: PricingResult;
  frontImageUrl: string;
  backImageUrl: string;
}

scanRouter.post(
  "/analyze",
  requireAuth,
  upload.fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as { front?: Express.Multer.File[]; back?: Express.Multer.File[] } | undefined;
    const frontFile = files?.front?.[0];
    const backFile = files?.back?.[0];
    if (!frontFile || !backFile) {
      return res.status(400).json({ error: "Both front and back images are required" });
    }

    try {
      const [frontQuality, backQuality] = await Promise.all([
        assessImageQuality(frontFile.buffer),
        assessImageQuality(backFile.buffer),
      ]);

      if (!frontQuality.passed || !backQuality.passed) {
        return res.status(422).json({
          error: "Image quality check failed",
          frontQuality,
          backQuality,
        });
      }

      const [frontStraight, backStraight] = await Promise.all([
        straightenAndCrop(frontFile.buffer),
        straightenAndCrop(backFile.buffer),
      ]);

      const vision = await identifyCardWithVision(frontStraight.buffer, backStraight.buffer);

      const matchedCard = vision.identification.name
        ? await findBestMatch({
            name: vision.identification.name,
            set: vision.identification.set,
            cardNumber: vision.identification.cardNumber,
          })
        : null;

      const identification: CardIdentification = matchedCard
        ? {
            ...vision.identification,
            setId: matchedCard.set.id,
            pokemonTcgIoId: matchedCard.id,
            imageUrl: matchedCard.images.large || matchedCard.images.small,
            totalInSet: vision.identification.totalInSet ?? matchedCard.set.total,
          }
        : vision.identification;

      const [grading, rawPricing, frontImageUrl, backImageUrl] = await Promise.all([
        runGradingPipeline(frontStraight.buffer, backStraight.buffer, [...vision.frontDefects, ...vision.backDefects], {
          front: frontQuality,
          back: backQuality,
        }),
        buildPricingResult(identification, matchedCard),
        saveImage(frontStraight.buffer, "processed"),
        saveImage(backStraight.buffer, "processed"),
      ]);

      // Re-point the headline price at the card's value AT the AI's estimated
      // grade (not just its raw/ungraded market price), once both the grade
      // and the raw pricing data are known. eBay is the only source that can
      // give a comp at the AI's exact grade rather than a fixed bucket, so
      // it's added in first (with its own sanity check against the raw
      // value baked in) before picking the closest available comp.
      const pricingWithEbay = await addEbayGradedComp(rawPricing, identification, grading);
      const pricing = applyGradeValuation(pricingWithEbay, grading);

      const response: ScanAnalyzeResponse = { identification, grading, pricing, frontImageUrl, backImageUrl };
      res.json(response);
    } catch (err) {
      console.error("scan analyze failed", err);
      res.status(500).json({ error: "Failed to analyze card scan" });
    }
  }
);

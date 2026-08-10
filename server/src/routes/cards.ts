import { Router } from "express";
import type { CardIdentification } from "@pokedex-vault/shared";
import { fetchAllSets, getCardById, searchCards, sortByCardNumber } from "../lib/pokemonTcgApi";
import { buildPricingResult } from "../lib/pricing/aggregator";
import { requireAuth } from "../middleware/auth";

export const cardsRouter = Router();

/** Powers a browsable "pick a set, then browse its cards" catalog, as an alternative to searching by name. */
cardsRouter.get("/sets", requireAuth, async (req, res) => {
  try {
    const sets = await fetchAllSets();
    res.json({ sets });
  } catch (err) {
    console.error("sets lookup failed", err);
    res.status(502).json({ error: "Set list lookup failed. Please try again." });
  }
});

cardsRouter.get("/sets/:setId/cards", requireAuth, async (req, res) => {
  try {
    const results = await searchCards({ setId: req.params.setId, pageSize: 250 });
    res.json({ results: sortByCardNumber(results) });
  } catch (err) {
    console.error("set cards lookup failed", err);
    res.status(502).json({ error: "Card list lookup failed. Please try again." });
  }
});

cardsRouter.get("/search", requireAuth, async (req, res) => {
  const { name, number, set } = req.query;
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Query parameter 'name' is required" });
  }
  try {
    const results = await searchCards({
      name,
      number: typeof number === "string" ? number : undefined,
      set: typeof set === "string" ? set : undefined,
      pageSize: 25,
    });
    res.json({ results });
  } catch (err) {
    console.error("card search failed", err);
    res.status(502).json({ error: "Card database lookup failed. Please try again." });
  }
});

/** Price lookup for a card the user doesn't necessarily own yet — powers the Prices tab. */
cardsRouter.get("/:id/price", requireAuth, async (req, res) => {
  const holoType = (typeof req.query.holo === "string" ? req.query.holo : "Non-Holo") as CardIdentification["holoType"];
  try {
    const card = await getCardById(req.params.id);
    if (!card) return res.status(404).json({ error: "Card not found" });

    const identification: CardIdentification = {
      confident: true,
      confidenceNote: null,
      name: card.name,
      set: card.set.name,
      setId: card.set.id,
      cardNumber: card.number,
      totalInSet: card.set.total,
      rarity: card.rarity ?? "",
      cardType: card.supertype,
      language: "English",
      holoType,
      variant: null,
      isPromo: false,
      isFirstEditionOrShadowless: false,
      pokemonTcgIoId: card.id,
      imageUrl: card.images.large || card.images.small,
    };

    const pricing = await buildPricingResult(identification, card);
    res.json({ card, pricing });
  } catch (err) {
    console.error("price lookup failed", err);
    res.status(502).json({ error: "Price lookup failed. Please try again." });
  }
});

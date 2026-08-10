import Anthropic from "@anthropic-ai/sdk";
import type { CardIdentification, CardLanguage, DefectFinding, HoloType } from "@pokedex-vault/shared";
import { env, isClaudeVisionConfigured } from "../env";

const MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

function bufferToImageBlock(buffer: Buffer, mediaType: "image/jpeg" | "image/png") {
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: mediaType,
      data: buffer.toString("base64"),
    },
  };
}

const IDENTIFY_TOOL = {
  name: "report_card_identification",
  description:
    "Report the identification of a Pokemon trading card and any visible condition defects, based on the front and back photos provided.",
  input_schema: {
    type: "object" as const,
    properties: {
      confident: { type: "boolean", description: "True only if you are reasonably confident in the identification." },
      confidenceNote: {
        type: ["string", "null"],
        description: "If not confident, briefly explain what's uncertain (e.g. 'set symbol not clearly visible'). Null if confident.",
      },
      name: { type: "string", description: "The Pokemon's name as printed on the card." },
      set: {
        type: "string",
        description:
          "The set name, e.g. 'Base Set', 'Obsidian Flames'. Identify this from the small set symbol/logo near the card number " +
          "(not just the Pokemon's popularity or art style) — cross-check it against the printed total (the '/197' part of the " +
          "card number) and the copyright year at the bottom of the card, since those narrow down the era/set reliably.",
      },
      cardNumber: {
        type: "string",
        description:
          "The card number exactly as printed, including any leading zeros, e.g. '004' if that's what's shown (not '4'). " +
          "Usually printed at the bottom edge in 'NUMBER/TOTAL' format.",
      },
      totalInSet: { type: ["string", "null"], description: "Total cards in the set if visible, e.g. '102' from '4/102'." },
      rarity: { type: "string", description: "e.g. Common, Uncommon, Rare, Rare Holo, Ultra Rare, Secret Rare." },
      cardType: { type: "string", description: "e.g. Pokemon, Trainer, Energy; plus the element type if applicable." },
      language: {
        type: "string",
        enum: ["English", "Japanese", "Korean", "Chinese", "German", "French", "Italian", "Spanish", "Portuguese", "Other"],
      },
      holoType: { type: "string", enum: ["Non-Holo", "Holo", "Reverse Holo", "Cosmos Holo", "Other"] },
      variant: { type: ["string", "null"], description: "Any special variant name, e.g. 'Alternate Art', 'Full Art', 'Gold'. Null if none." },
      isPromo: { type: "boolean" },
      isFirstEditionOrShadowless: { type: "boolean" },
      frontDefects: {
        type: "array",
        description: "Visible condition issues on the FRONT photo only.",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "scratch", "whitening", "surface_mark", "print_line", "holo_scratch", "stain", "dent", "crease",
                "scuffing", "print_imperfection", "edge_wear", "color_issue", "alignment_issue", "corner_wear",
                "chipping", "layering", "bend",
              ],
            },
            zone: {
              type: "string",
              enum: [
                "corner_top_left", "corner_top_right", "corner_bottom_left", "corner_bottom_right",
                "edge_top", "edge_bottom", "edge_left", "edge_right", "surface_center", "surface_general",
              ],
            },
            description: { type: "string" },
            severity: { type: "string", enum: ["minor", "moderate", "major"] },
          },
          required: ["category", "zone", "description", "severity"],
        },
      },
      backDefects: {
        type: "array",
        description: "Visible condition issues on the BACK photo only. Same shape as frontDefects.",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "scratch", "whitening", "surface_mark", "print_line", "holo_scratch", "stain", "dent", "crease",
                "scuffing", "print_imperfection", "edge_wear", "color_issue", "alignment_issue", "corner_wear",
                "chipping", "layering", "bend",
              ],
            },
            zone: {
              type: "string",
              enum: [
                "corner_top_left", "corner_top_right", "corner_bottom_left", "corner_bottom_right",
                "edge_top", "edge_bottom", "edge_left", "edge_right", "surface_center", "surface_general",
              ],
            },
            description: { type: "string" },
            severity: { type: "string", enum: ["minor", "moderate", "major"] },
          },
          required: ["category", "zone", "description", "severity"],
        },
      },
    },
    required: [
      "confident", "confidenceNote", "name", "set", "cardNumber", "totalInSet", "rarity", "cardType",
      "language", "holoType", "variant", "isPromo", "isFirstEditionOrShadowless", "frontDefects", "backDefects",
    ],
  },
};

export interface VisionResult {
  identification: CardIdentification;
  frontDefects: DefectFinding[];
  backDefects: DefectFinding[];
}

function unconfiguredResult(): VisionResult {
  return {
    identification: {
      confident: false,
      confidenceNote: "AI identification isn't configured on this server (no ANTHROPIC_API_KEY set). Please search for and select the card manually.",
      name: "",
      set: "",
      setId: null,
      cardNumber: "",
      totalInSet: null,
      rarity: "",
      cardType: "",
      language: "English",
      holoType: "Non-Holo",
      variant: null,
      isPromo: false,
      isFirstEditionOrShadowless: false,
      pokemonTcgIoId: null,
      imageUrl: null,
    },
    frontDefects: [],
    backDefects: [],
  };
}

export async function identifyCardWithVision(frontBuffer: Buffer, backBuffer: Buffer): Promise<VisionResult> {
  if (!isClaudeVisionConfigured()) return unconfiguredResult();

  try {
    return await callVision(frontBuffer, backBuffer);
  } catch (err) {
    // Grading and pricing don't depend on identification succeeding, so a
    // billing/rate-limit/network failure here should degrade to manual
    // search rather than fail the whole scan.
    console.error("Claude Vision identification failed", err);
    const message =
      err instanceof Anthropic.APIError
        ? (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? err.message
        : "AI identification failed unexpectedly.";
    return {
      ...unconfiguredResult(),
      identification: {
        ...unconfiguredResult().identification,
        confidenceNote: `AI identification is temporarily unavailable (${message}). Please search for and select the card manually.`,
      },
    };
  }
}

async function callVision(frontBuffer: Buffer, backBuffer: Buffer): Promise<VisionResult> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    tools: [IDENTIFY_TOOL],
    tool_choice: { type: "tool", name: IDENTIFY_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "You are an expert Pokemon TCG card identifier and condition inspector. Here are two photos: the FRONT of the card, then the BACK. " +
              "Identify the card precisely from the printed details (name, set, card number, rarity, holo type, language, promo/first-edition markers). " +
              "\n\nSet and card number deserve extra care, since many Pokemon (e.g. Charizard) have dozens of different printings and getting " +
              "these wrong points to the wrong card entirely: " +
              "\n- Find the card number, usually at the bottom edge in 'NUMBER/TOTAL' format (or 'NUMBER/TOTAL' near a set symbol on the back for " +
              "older cards). Transcribe the number exactly as printed, including any leading zeros (e.g. '004', not '4'). " +
              "\n- Identify the set primarily from the small set symbol/icon near the card number, not just from the Pokemon or art style — many " +
              "sets reuse similar art, and the symbol is the reliable signal. If you don't recognize the symbol, use the total-in-set number and " +
              "the copyright year at the bottom of the card to narrow down the era, and say so in confidenceNote if you're inferring rather than " +
              "reading the set name directly. " +
              "\n- If the set symbol or number is blurry, cropped out, or otherwise not clearly legible, set confident to false and say specifically " +
              "which one is uncertain in confidenceNote — do not guess a specific set or number you can't actually read. " +
              "\n\nFor anything else ambiguous or not clearly legible, also set confident to false and explain why in confidenceNote rather than guessing. " +
              "\n\nThen separately inspect the front and back photos closely for visible condition defects, with an approximate zone for each. Pay particular attention to two categories that are easy to miss at a glance: " +
              "\n- PRINTING ERRORS — factory defects from the printing process itself, not handling damage: print lines or streaks, ink smudges or spots, color bleeding or blurring between layers, misregistration/ghosting where a print layer is visibly offset from the others, blank or missing ink patches, and off-center or miscut printing. Use category 'print_line' for streaks/lines, 'print_imperfection' for smudges/spots/missing ink, 'color_issue' for bleeding/blurring/discoloration, and 'alignment_issue' for print-layer misregistration or miscuts. " +
              "\n- WHITENING along the corners and edges — where the colored border layer has worn, chipped, or scuffed away to reveal the white cardboard core beneath. Look closely at all four corners and all four edges on both photos; even small pale flecks at a corner tip or a thin white line along an edge count. Use category 'whitening' with the specific corner_/edge_ zone, or 'chipping'/'corner_wear'/'edge_wear' for more pronounced wear. " +
              "\nAlso report any other defects you see: scratches, stains, dents, creases, scuffing, holo scratches, layering, or bends. " +
              "Only report defects you can actually see — do not invent issues, and do not report a defect you're not reasonably sure of just to be thorough.",
          },
          bufferToImageBlock(frontBuffer, "image/jpeg"),
          bufferToImageBlock(backBuffer, "image/jpeg"),
        ],
      },
    ],
  });

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) {
    return unconfiguredResult();
  }

  const input = toolUse.input as {
    confident: boolean;
    confidenceNote: string | null;
    name: string;
    set: string;
    cardNumber: string;
    totalInSet: string | null;
    rarity: string;
    cardType: string;
    language: CardLanguage;
    holoType: HoloType;
    variant: string | null;
    isPromo: boolean;
    isFirstEditionOrShadowless: boolean;
    frontDefects: Array<Omit<DefectFinding, "side">>;
    backDefects: Array<Omit<DefectFinding, "side">>;
  };

  return {
    identification: {
      confident: input.confident,
      confidenceNote: input.confidenceNote,
      name: input.name,
      set: input.set,
      setId: null,
      cardNumber: input.cardNumber,
      totalInSet: input.totalInSet,
      rarity: input.rarity,
      cardType: input.cardType,
      language: input.language,
      holoType: input.holoType,
      variant: input.variant,
      isPromo: input.isPromo,
      isFirstEditionOrShadowless: input.isFirstEditionOrShadowless,
      pokemonTcgIoId: null,
      imageUrl: null,
    },
    frontDefects: input.frontDefects.map((d) => ({ ...d, side: "front" as const })),
    backDefects: input.backDefects.map((d) => ({ ...d, side: "back" as const })),
  };
}

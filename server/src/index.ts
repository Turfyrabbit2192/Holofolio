import express from "express";
import cors from "cors";
import fs from "fs";
import { env, isClaudeVisionConfigured } from "./env";
import { authRouter } from "./routes/auth";
import { scanRouter } from "./routes/scan";
import { cardsRouter } from "./routes/cards";
import { collectionRouter } from "./routes/collection";
import { dashboardRouter } from "./routes/dashboard";

fs.mkdirSync(env.uploadDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(env.uploadDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    claudeVisionConfigured: isClaudeVisionConfigured(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/scan", scanRouter);
app.use("/api/cards", cardsRouter);
app.use("/api/collection", collectionRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(env.port, () => {
  console.log(`Pokedex Vault API listening on :${env.port}`);
  if (!isClaudeVisionConfigured()) {
    console.warn("ANTHROPIC_API_KEY not set — AI card identification will require manual search fallback.");
  }
});

import type { CompanyGradeEstimate, DefectFinding, GradingCompany, GradingQualifier, SubgradeScores } from "@pokedex-vault/shared";

function round(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Each grading company publishes (or is widely understood to follow)
 * different centering tolerances and different ways of rolling four
 * subgrades into one number. These profiles are original approximations of
 * that publicly-documented philosophy, not the companies' real proprietary
 * algorithms — the UI must always label results as estimates.
 */
export function buildCompanyEstimates(subgrades: SubgradeScores, centeringOffset: number): CompanyGradeEstimate[] {
  const { centering, corners, edges, surface } = subgrades;

  const estimates: CompanyGradeEstimate[] = [];

  // --- PSA-style: holistic, gated hard by centering tolerance, whole numbers only.
  {
    let cap = 10;
    if (centeringOffset > 5) cap = 9;
    if (centeringOffset > 10) cap = 8;
    if (centeringOffset > 15) cap = 7;
    if (centeringOffset > 20) cap = 6;
    if (centeringOffset > 25) cap = 5;
    const worst = Math.min(corners, edges, surface);
    const raw = Math.min(cap, Math.round((worst * 0.5 + (corners + edges + surface) / 3 * 0.5)));
    estimates.push({
      company: "PSA",
      overall: clamp(round(raw, 1), 1, 10),
      subgrades,
      scale: "1-10 whole numbers",
      notes: [
        "PSA does not publish numeric subgrades to consumers, so this estimate mirrors their published centering tolerance bands (e.g. 55/45 for Gem Mint 10) and treats the worst flaw as the ceiling.",
      ],
    });
  }

  // --- BGS/Beckett-style: publishes all four subgrades, half-point increments, overall driven mostly by the lowest subgrade.
  {
    const avg = (centering + corners + edges + surface) / 4;
    const worst = Math.min(centering, corners, edges, surface);
    let raw = avg * 0.45 + worst * 0.55;
    // Approximate Beckett's rule that the overall can't sit far above the lowest subgrade.
    if (raw > worst + 0.5) raw = worst + 0.5;
    estimates.push({
      company: "BGS",
      overall: clamp(round(raw, 0.5), 1, 10),
      subgrades,
      scale: "1-10 in 0.5 increments, published per-category subgrades",
      notes: [
        "Beckett publishes centering, corners, edges, and surface subgrades and weights the lowest one heavily — a single weak subgrade caps the overall (e.g. Gem Mint 9.5 generally requires no subgrade below 9).",
      ],
    });
  }

  // --- CGC-style: similar holistic approach to PSA but slightly more centering-tolerant, whole/half grades.
  {
    let cap = 10;
    if (centeringOffset > 6) cap = 9.5;
    if (centeringOffset > 11) cap = 9;
    if (centeringOffset > 16) cap = 8;
    if (centeringOffset > 22) cap = 7;
    const worst = Math.min(corners, edges, surface);
    const raw = Math.min(cap, (worst * 0.5 + (corners + edges + surface) / 3 * 0.5));
    estimates.push({
      company: "CGC",
      overall: clamp(round(raw, 0.5), 1, 10),
      subgrades,
      scale: "1-10 in 0.5 increments",
      notes: [
        "CGC Cards grades holistically like PSA but is generally understood to allow slightly more centering variance at the top grades.",
      ],
    });
  }

  // --- TAG-style: computer-vision-first, precise decimal scale, closest to a straight weighted average of measured subgrades.
  {
    const raw = centering * 0.3 + corners * 0.25 + edges * 0.2 + surface * 0.25;
    estimates.push({
      company: "TAG",
      overall: clamp(Math.round(raw * 100) / 100, 1, 10),
      subgrades,
      scale: "1-10 to two decimal places",
      notes: [
        "TAG markets itself as AI/computer-vision-driven precision grading with decimal-level scores, so this profile is modeled as a direct weighted average of the four measured subgrades.",
      ],
    });
  }

  return estimates;
}

export function explainVariance(estimates: CompanyGradeEstimate[]): string {
  const values = estimates.map((e) => e.overall);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max - min < 0.4) {
    return "All four grading profiles landed close together, meaning centering, corners, edges, and surface were fairly consistent with no single dominant flaw.";
  }
  return "Estimates differ mainly because PSA and CGC apply a hard centering-tolerance ceiling before considering other flaws, BGS weights the single worst subgrade heavily instead of averaging, and TAG uses a straight weighted average of all four measured subgrades. A card with borderline centering or one noticeably weaker category will see the biggest spread between profiles.";
}

export function overallCompanyList(): GradingCompany[] {
  return ["PSA", "TAG", "BGS", "CGC"];
}

/**
 * Rolls up the detected findings into short shorthand flags reminiscent of
 * (but not identical to — these are original labels, not real company
 * codes) the qualifier notations grading companies attach to a numeric
 * grade for a specific called-out condition issue.
 */
export function buildQualifiers(subgrades: SubgradeScores, centeringOffset: number, defects: DefectFinding[]): GradingQualifier[] {
  const qualifiers: GradingQualifier[] = [];

  if (centeringOffset > 15) {
    qualifiers.push({
      code: "OC",
      label: "Off-Center",
      note: `Centering is roughly ${Math.round(50 + centeringOffset)}/${Math.round(
        50 - centeringOffset
      )} on its worst axis — significant enough that graders typically call it out even when it doesn't disqualify a numeric grade.`,
    });
  }

  const hasCrease = defects.some((d) => d.category === "crease" || d.category === "bend");
  if (hasCrease) {
    qualifiers.push({
      code: "CR",
      label: "Possible Crease",
      note: "A likely fold or crease line was detected. Most grading companies treat creases as a severe defect regardless of how clean the rest of the card looks, often capping the grade well below what corners/edges alone would suggest.",
    });
  }

  if (defects.some((d) => d.category === "print_line" || d.category === "print_imperfection" || d.category === "alignment_issue")) {
    qualifiers.push({
      code: "PRT",
      label: "Printing Error",
      note: "A print line, smudge/imperfection, or print misregistration was flagged. This is a factory defect rather than handling damage, but it still counts against the surface subgrade.",
    });
  }

  if (defects.some((d) => d.category === "stain" || d.category === "color_issue")) {
    qualifiers.push({
      code: "ST",
      label: "Staining",
      note: "Possible staining, discoloration, or color bleeding was flagged on at least one side.",
    });
  }

  if (subgrades.surface <= 5 && !hasCrease) {
    qualifiers.push({
      code: "SUR",
      label: "Heavy Surface Wear",
      note: "Surface texture analysis found a high concentration of marks or scratches across the card.",
    });
  }

  return qualifiers;
}

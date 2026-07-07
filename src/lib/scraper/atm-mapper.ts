// AI-powered ATM mapping module — implements the Auto-ISAC ATM Mapping Methodology.
//
// This module performs attacker-intent-first threat incident analysis using the AI,
// following the 5-step methodology:
//   1. Establish the Incident Context (target, interface, attack surface, effect)
//   2. Separate Observed Facts from Analytical Inference
//   3. Identify Credible Adversary Objectives (Tactics) from the attacker's perspective
//   4. Evaluate Candidate Techniques Against the Target Environment
//   5. Develop a Credible Adversary Behavior Mapping + test from attacker's perspective
//
// The AI is given the full ATM tactic+technique taxonomy and the incident details,
// then produces a structured mapping with:
//   - Identified tactics (with reasoning)
//   - Mapped techniques (with evidence type: observed/inferred)
//   - Attacker intent reconstruction
//   - Confidence assessment
//   - Analytical notes (what's known, inferred, unknown)

import { chatCompletionText } from "@/lib/ai-provider";
import { ATM_TACTICS } from "@/lib/atm";
import { db } from "@/lib/db";

export type AtmMappingResult = {
  threatId: string;
  incidentContext: {
    targetAsset: string;
    exposedInterface: string;
    attackSurface: string;
    observedEffect: string;
    vehicleLevelConsequence: string;
  };
  attackerIntent: string;
  tactics: {
    name: string;
    reasoning: string;
    evidenceType: "observed" | "inferred";
    techniques: {
      name: string;
      id: string;
      reasoning: string;
      evidenceType: "observed" | "inferred";
      technicallyConsistent: boolean;
    }[];
  }[];
  knownFacts: string[];
  inferences: string[];
  unknowns: string[];
  confidence: "high" | "medium" | "low";
  analyticalNotes: string;
  mappingComplete: boolean;
};

const TACTIC_TAXONOMY = ATM_TACTICS.map(
  (t) =>
    `TACTIC: ${t.name}\n  ID: ${t.id}\n  Description: ${t.description}\n  Techniques:\n${t.techniques
      .map((tech) => `    - ${tech.id}: ${tech.name} — ${tech.description.slice(0, 120)}`)
      .join("\n")}`,
).join("\n\n");

const MAPPING_SYSTEM_PROMPT = `You are a senior automotive cybersecurity analyst performing Auto-ISAC Automotive Threat Matrix (ATM) incident mapping.

## Analytical Doctrine
ATTACKER INTENT FIRST, MATRIX AS A REASONING AID.

You must NOT begin with forced traversal of the matrix. You must begin with the incident itself: the known target, the exposed interface, the attack surface, the affected component, the resulting effect, and the available technical evidence.

From that basis, reconstruct the attacker's perspective. The core analytical question is NOT "Which matrix cell should be filled next?" but rather:

"What was the attacker trying to achieve, and what methods would make technical sense in this environment?"

## Methodology (5 Steps)

### Step 1: Establish the Incident Context
Consolidate the incident into a technically meaningful context. Identify:
- Target asset or subsystem
- Hardware model, ECU, firmware, software component
- Exposed interface or communication path
- Known entry point or attack surface
- Observed attacker action
- Observed technical effect
- Vehicle-level consequence

### Step 2: Separate Observed Facts from Analytical Inference
Classify all incident material into:
- Observed: directly supported by the source material
- Inferred: supported by technical reasoning based on architecture, protocol behavior, or known exploit conditions
- Unknown: not established by the available record

Do NOT manufacture certainty. A high-quality analysis does not fill gaps with assumptions.

### Step 3: Identify Credible Adversary Objectives (Tactics)
From the attacker's perspective, evaluate which adversary objectives (Tactics) are indicated. Ask:
- What objective was the attacker attempting to achieve?
- What intermediate objective would have been necessary to enable the next stage?
- Does the observed effect imply prior attacker activity not directly disclosed?
- Are repeated or alternating objectives likely?

The output is a SET of credible adversary objectives — NOT a linear sequence.

### Step 4: Evaluate Candidate Techniques Against the Target Environment
For each identified Tactic, evaluate which Techniques would reasonably support that objective within the specific environment. Consider:
- Hardware characteristics, firmware behavior, software exposure
- Communication interfaces, protocol properties
- Access assumptions, trust boundaries, privilege model
- Realistic exploitation constraints

The operative question is: "Would this technique make technical sense if the attacker were pursuing this objective against this target?"

Do NOT rely on keyword matching. A keyword match does not guarantee analytical fit. Review the full technique set and consider technical credibility.

### Step 5: Test the Mapping from the Attacker's Perspective
Before finalizing, test the mapping as a simulated attacker thought process:
- If the objective were to compromise this target, would these techniques be a sensible choice?
- Would the target's interfaces and architecture realistically allow this method?
- Does the mapping assume steps that contradict the known environment?
- Does the proposed behavior explain the observed outcome without forcing unsupported stages?

If the mapping fails this review, revise it.

## Common Errors to Avoid
1. Treating the matrix as a mandatory linear sequence — not every incident traverses all tactics
2. Mapping components instead of behavior — ECU names/protocols are context, not the mapping outcome
3. Using keyword matching as the primary technique selection method
4. Confusing observed evidence with assumed enablement steps
5. Overstating confidence — uncertain stages must be marked as inference

## Official ATM Taxonomy
${TACTIC_TAXONOMY}

## Output Format
Return ONLY a valid JSON object (no markdown, no explanation outside the JSON):

{
  "incidentContext": {
    "targetAsset": "string — the target asset/subsystem identified from the incident",
    "exposedInterface": "string — the exposed interface or communication path",
    "attackSurface": "string — the known entry point or attack surface",
    "observedEffect": "string — the observed technical effect",
    "vehicleLevelConsequence": "string — the vehicle-level consequence, or 'Not directly applicable' if IT/OT breach"
  },
  "attackerIntent": "string — one paragraph reconstructing the attacker's intent and objectives",
  "tactics": [
    {
      "name": "must match an official ATM tactic name exactly",
      "reasoning": "string — why this tactic is credible from the attacker's perspective",
      "evidenceType": "observed" | "inferred",
      "techniques": [
        {
          "name": "must match an official ATM technique name exactly",
          "id": "must match the technique's ATM-Txxxx ID",
          "reasoning": "string — why this technique is technically consistent with the target environment",
          "evidenceType": "observed" | "inferred",
          "technicallyConsistent": true
        }
      ]
    }
  ],
  "knownFacts": ["string — each directly observed fact from the source material"],
  "inferences": ["string — each analytical inference with its technical basis"],
  "unknowns": ["string — each element that remains unknown/unestablished"],
  "confidence": "high" | "medium" | "low",
  "analyticalNotes": "string — overall assessment, limitations, and analytical caveats",
  "mappingComplete": true
}`;

// Map a single threat to the ATM using the full 5-step methodology.
export async function mapThreatToAtm(threatId: string): Promise<AtmMappingResult> {
  const threat = await db.threat.findUnique({ where: { id: threatId } });
  if (!threat) throw new Error("Threat not found");

  const incidentDetails = JSON.stringify({
    title: threat.title,
    description: threat.description,
    sourceName: threat.sourceName,
    sourceUrl: threat.sourceUrl,
    victimOrg: threat.victimOrg,
    victimSector: threat.victimSector,
    country: threat.country,
    actor: threat.actor,
    dataTypes: threat.dataTypes,
    severity: threat.severity,
    attackDate: threat.attackDate,
    automotiveCategory: threat.automotiveCategory,
    currentAtmTactic: threat.atmTactic,
    currentAtmTechnique: threat.atmTechnique,
    classificationReason: threat.classificationReason,
  }, null, 2);

  const raw = await chatCompletionText({
    messages: [
      { role: "assistant", content: MAPPING_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Perform the full 5-step ATM mapping methodology on the following threat incident:\n\n${incidentDetails}`,
      },
    ],
    thinking: { type: "disabled" },
  });
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);

  // Validate tactic/technique names against the official taxonomy
  const tacticNames = new Set(ATM_TACTICS.map((t) => t.name));
  const techniqueMap = new Map<string, { id: string; tactic: string }>();
  for (const t of ATM_TACTICS) {
    for (const tech of t.techniques) {
      techniqueMap.set(tech.name, { id: tech.id, tactic: t.name });
    }
  }

  type RawTactic = { name?: string; reasoning?: string; evidenceType?: string; techniques?: unknown[] };
  type RawTech = { name?: string; id?: string; reasoning?: string; evidenceType?: string; technicallyConsistent?: boolean };

  const validatedTactics = ((parsed.tactics || []) as RawTactic[])
    .filter((t) => t.name && tacticNames.has(t.name))
    .map((t) => ({
      name: t.name!,
      reasoning: String(t.reasoning || ""),
      evidenceType: (t.evidenceType === "observed" ? "observed" : "inferred") as "observed" | "inferred",
      techniques: (Array.isArray(t.techniques) ? (t.techniques as RawTech[]) : [])
        .filter((tech) => {
          if (!tech.name) return false;
          if (techniqueMap.has(tech.name)) return true;
          const fuzzy = [...techniqueMap.keys()].find(
            (k) => k.toLowerCase() === tech.name!.toLowerCase(),
          );
          return !!fuzzy;
        })
        .map((tech) => {
          const techName = tech.name!;
          const exact = techniqueMap.get(techName);
          const fuzzy = exact ? null : [...techniqueMap.keys()].find(
            (k) => k.toLowerCase() === techName.toLowerCase(),
          );
          const matched = exact ?? (fuzzy ? techniqueMap.get(fuzzy) : null);
          return {
            name: matched ? (fuzzy ?? techName) : techName,
            id: matched?.id ?? tech.id ?? "",
            reasoning: String(tech.reasoning || ""),
            evidenceType: (tech.evidenceType === "observed" ? "observed" : "inferred") as "observed" | "inferred",
            technicallyConsistent: tech.technicallyConsistent !== false,
          };
        }),
    }));

  const result: AtmMappingResult = {
    threatId,
    incidentContext: {
      targetAsset: String(parsed.incidentContext?.targetAsset || "Unknown"),
      exposedInterface: String(parsed.incidentContext?.exposedInterface || "Unknown"),
      attackSurface: String(parsed.incidentContext?.attackSurface || "Unknown"),
      observedEffect: String(parsed.incidentContext?.observedEffect || "Unknown"),
      vehicleLevelConsequence: String(parsed.incidentContext?.vehicleLevelConsequence || "Not directly applicable"),
    },
    attackerIntent: String(parsed.attackerIntent || ""),
    tactics: validatedTactics,
    knownFacts: Array.isArray(parsed.knownFacts) ? parsed.knownFacts.map(String) : [],
    inferences: Array.isArray(parsed.inferences) ? parsed.inferences.map(String) : [],
    unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns.map(String) : [],
    confidence: (["high", "medium", "low"].includes(String(parsed.confidence))
      ? String(parsed.confidence)
      : "low") as "high" | "medium" | "low",
    analyticalNotes: String(parsed.analyticalNotes || ""),
    mappingComplete: Boolean(parsed.mappingComplete),
  };

  // Update the threat's ATM mapping in the DB with the primary tactic+technique
  if (validatedTactics.length > 0) {
    const primaryTactic = validatedTactics[0];
    const primaryTechnique = primaryTactic.techniques[0];
    await db.threat.update({
      where: { id: threatId },
      data: {
        atmTactic: primaryTactic.name,
        atmTechnique: primaryTechnique?.name ?? null,
        classificationReason: `[AI ATM Mapping] ${result.attackerIntent.slice(0, 200)}`,
      },
    });
  }

  return result;
}

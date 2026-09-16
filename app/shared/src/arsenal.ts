/**
 * The 34-SME arsenal (SAGE Master Orchestration Directive v10, §2).
 *
 * SOURCE OF TRUTH: transcribed from the portable SME arsenal manifest at
 * `sme-arsenal/manifest.json` so the app and the skill library stay in sync.
 * Every entry's id, name, tier, category, domains, and hierarchyRank match
 * the manifest exactly. The manifest's SAGE orchestrator entry (id 0) is NOT
 * part of the arsenal — it is the orchestrator, not a taskable SME.
 *
 * Tiers: Strategic (ids 1–21), Operational (ids 22–28), Tactical (ids 29–34).
 *
 * _Requirements: 3.1, 2.4_
 */

import type { Sme } from "./models.js";

/**
 * The 34 taskable SMEs, ordered by id (1..34).
 */
export const SME_ARSENAL: readonly Sme[] = [
  // --- TIER 1: Strategic / Enterprise Wing (SAGE's Primary Advisors) ---
  {
    id: 1,
    name: "JCIDS & DOTMLPF-C Requirements Analyst",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["Requirements", "ForceDesign"],
    hierarchyRank: 2,
  },
  {
    id: 2,
    name: "Total Force Structure (TFSD) & MOS Architect",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["ForceStructure", "Manpower", "MOS"],
    hierarchyRank: 2,
  },
  {
    id: 3,
    name: "MILCON & Infrastructure Planner",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["MILCON", "Infrastructure", "RangeSafety", "Environmental"],
    hierarchyRank: 3,
  },
  {
    id: 4,
    name: "Capabilities Transition (IOC/FOC) Manager",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["Transition", "Timelines", "Throughput"],
    hierarchyRank: 3,
  },
  {
    id: 5,
    name: "Resources, Manpower & POM Strategist",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["POM", "Manpower", "Budget"],
    hierarchyRank: 3,
  },
  {
    id: 6,
    name: "Supply Chain & Materiel Logistics SME (G-4)",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["Logistics", "SupplyChain", "Materiel"],
    hierarchyRank: 3,
  },
  {
    id: 7,
    name: "Maintenance Management & Readiness SME (G-4)",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["Maintenance", "Readiness", "Equipment"],
    hierarchyRank: 3,
  },
  {
    id: 8,
    name: "Financial Execution & Audit SME (G-8)",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["Finance", "Audit", "Budget"],
    hierarchyRank: 3,
  },
  {
    id: 9,
    name: "Aviation Logistics & Readiness SME (G-4 Avn)",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["Aviation", "Logistics", "Readiness"],
    hierarchyRank: 3,
  },
  {
    id: 10,
    name: "Enterprise Doctrine & Policy Analyst",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["Doctrine", "Policy"],
    hierarchyRank: 2,
  },
  {
    id: 11,
    name: "Cognitive & Learning Science Expert",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["LearningScience", "Cognition", "Pedagogy"],
    hierarchyRank: 2,
  },
  {
    id: 12,
    name: "Org Change & Human Dynamics SME",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["OrgChange", "HumanDynamics", "Culture"],
    hierarchyRank: 4,
  },
  {
    id: 13,
    name: "Holistic Human Performance Analyst",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["HumanPerformance", "Biometrics", "Readiness"],
    hierarchyRank: 2,
  },
  {
    id: 14,
    name: "Enterprise KM & O365 Architect",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["KnowledgeManagement", "O365", "DataTaxonomy"],
    hierarchyRank: 3,
  },
  {
    id: 15,
    name: "Executive Staff Action (SSEC) & Policy Editor",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["Correspondence", "StaffAction", "Policy"],
    hierarchyRank: 2,
  },
  {
    id: 16,
    name: "Strategic Information Design & Executive Branding SME",
    tier: "Strategic",
    category: "PrimaryAdvisor",
    domains: ["InformationDesign", "Visualization", "ExecutiveBriefing"],
    hierarchyRank: 3,
  },
  {
    id: 17,
    name: "Legal & Ethics Advisor (SJA)",
    tier: "Strategic",
    category: "SpecialStaff",
    domains: ["Legal", "Ethics", "FiscalLaw"],
    hierarchyRank: 1,
  },
  {
    id: 18,
    name: "Strategic Communication & Public Affairs SME",
    tier: "Strategic",
    category: "SpecialStaff",
    domains: ["StrategicComms", "PublicAffairs", "Messaging"],
    hierarchyRank: 2,
  },
  {
    id: 19,
    name: "Human Capital & Readiness Manager (G-1) SME",
    tier: "Strategic",
    category: "SpecialStaff",
    domains: ["Personnel", "Readiness", "Retention"],
    hierarchyRank: 3,
  },
  {
    id: 20,
    name: "Threat & Adversary TTP Integration SME",
    tier: "Strategic",
    category: "SpecialStaff",
    domains: ["Intelligence", "Threat", "TTP"],
    hierarchyRank: 2,
  },
  {
    id: 21,
    name: "Enterprise Assessment & Readiness SME (Inspector General - IG)",
    tier: "Strategic",
    category: "SpecialStaff",
    domains: ["Assessment", "Readiness", "Inspections", "Compliance"],
    hierarchyRank: 2,
  },

  // --- TIER 2: Operational / Schoolhouse Wing (Compliance & Logistics) ---
  {
    id: 22,
    name: "POI Lifecycle & Compliance Analyst",
    tier: "Operational",
    category: "TechnicalSme",
    domains: ["POI", "Compliance", "MLF"],
    hierarchyRank: 2,
  },
  {
    id: 23,
    name: "Faculty Culture & Development SME",
    tier: "Operational",
    category: "TechnicalSme",
    domains: ["FacultyDevelopment", "Culture", "ChangeManagement"],
    hierarchyRank: 4,
  },
  {
    id: 24,
    name: "Applied Learning & Scheduling Logistician",
    tier: "Operational",
    category: "TechnicalSme",
    domains: ["Scheduling", "RangeManagement", "Sequencing"],
    hierarchyRank: 3,
  },
  {
    id: 25,
    name: "Instructional Diagnostics Analyst",
    tier: "Operational",
    category: "TechnicalSme",
    domains: ["Diagnostics", "DataAnalysis", "Attrition"],
    hierarchyRank: 3,
  },
  {
    id: 26,
    name: "EdTech & LMS Administrator",
    tier: "Operational",
    category: "TechnicalSme",
    domains: ["EdTech", "LMS", "DigitalDelivery"],
    hierarchyRank: 4,
  },
  {
    id: 27,
    name: "S-3 Operations & Battle Rhythm Manager",
    tier: "Operational",
    category: "TechnicalSme",
    domains: ["Operations", "BattleRhythm", "Scheduling"],
    hierarchyRank: 3,
  },
  {
    id: 28,
    name: "Operational Instructional Graphics & Media Coordinator",
    tier: "Operational",
    category: "TechnicalSme",
    domains: ["Graphics", "Media", "Visualization"],
    hierarchyRank: 3,
  },

  // --- TIER 3: Tactical / Classroom Wing (Classroom & Instructor Support) ---
  {
    id: 29,
    name: "Curriculum Architecture (ADDIE/4C-ID) SME",
    tier: "Tactical",
    category: "TechnicalSme",
    domains: ["Curriculum", "InstructionalDesign"],
    hierarchyRank: 3,
  },
  {
    id: 30,
    name: "Stress Inoculation & Scenario Designer",
    tier: "Tactical",
    category: "TechnicalSme",
    domains: ["ScenarioDesign", "StressInoculation", "TDG"],
    hierarchyRank: 3,
  },
  {
    id: 31,
    name: "Tactical Assessment & Evaluation SME",
    tier: "Tactical",
    category: "TechnicalSme",
    domains: ["Assessment", "BARS", "Evaluation"],
    hierarchyRank: 3,
  },
  {
    id: 32,
    name: "Classroom Facilitation Coach",
    tier: "Tactical",
    category: "TechnicalSme",
    domains: ["Facilitation", "ClassroomManagement", "AAR"],
    hierarchyRank: 4,
  },
  {
    id: 33,
    name: "Tactical Automation & Workflow Scripter",
    tier: "Tactical",
    category: "TechnicalSme",
    domains: ["Automation", "LowCode", "Workflow"],
    hierarchyRank: 3,
  },
  {
    id: 34,
    name: "Tactical Course Media & Simulator Designer",
    tier: "Tactical",
    category: "TechnicalSme",
    domains: ["Media", "Simulator", "VisualRubrics"],
    hierarchyRank: 3,
  },
] as const;

/** Number of SMEs in the arsenal (excludes the SAGE orchestrator, id 0). */
export const SME_COUNT = SME_ARSENAL.length;

/** Internal id -> SME index for O(1) lookup. */
const SME_BY_ID: ReadonlyMap<number, Sme> = new Map(
  SME_ARSENAL.map((sme) => [sme.id, sme]),
);

/**
 * Look up a single SME by its numbered id (1..34).
 * Returns `undefined` if no SME has that id (e.g. id 0 or out of range).
 * Used by the SME selector to resolve routing-block ids back to full records.
 */
export function getSmeById(id: number): Sme | undefined {
  return SME_BY_ID.get(id);
}

/**
 * Resolve a list of SME ids to their full records, in the same order.
 * Unknown ids are skipped. Convenience for the SME selector / routing block.
 */
export function getSmesByIds(ids: readonly number[]): Sme[] {
  const result: Sme[] = [];
  for (const id of ids) {
    const sme = SME_BY_ID.get(id);
    if (sme !== undefined) result.push(sme);
  }
  return result;
}

/** All SMEs at a given tier. */
export function getSmesByTier(tier: Sme["tier"]): Sme[] {
  return SME_ARSENAL.filter((sme) => sme.tier === tier);
}

/** All SMEs of a given organizational category. */
export function getSmesByCategory(category: Sme["category"]): Sme[] {
  return SME_ARSENAL.filter((sme) => sme.category === category);
}

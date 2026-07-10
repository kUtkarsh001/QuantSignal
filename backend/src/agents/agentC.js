/**
 * agentC.js — Manager / Synthesiser
 * Architecture §6.3
 *
 * Receives the structured JSON outputs of Agent A and Agent B.
 * Decides whether the two agents AGREE or DISAGREE on market direction.
 * Produces a plain-English reasoning explanation and a conflict flag.
 *
 * Input variables:
 *   agent_a_output    — JSON.stringify(agentAResult)
 *   agent_b_output    — JSON.stringify(agentBResult)
 *   agent_b_available — boolean (false when no PDFs or Agent B failed)
 *
 * Output: JSON string → { agreement, conflictFlag, reasoning }
 *   agreement   : boolean
 *   conflictFlag: string (one sentence) | null
 *   reasoning   : string (minimum 3 sentences)
 *
 * CRITICAL: Agent C does NOT compute confidenceScore.
 *   That is calculated deterministically in agentController.js (Architecture §6.5):
 *     agreement=true  → agentA.strength + agentB.confidence
 *     agreement=false → round((agentA.strength + agentB.confidence) × 0.70)
 *     agentB unavail  → agentA.strength × 2
 *
 * CRITICAL: Always use safeParseJSON() on the output — never JSON.parse() directly.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

// ── Gemini model — same version as agentA/agentB ─────────────────────────────
const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model:  'gemini-2.5-flash',
});

// ── Prompt — Architecture §6.3 ───────────────────────────────────────────────
// NOTE: "Do NOT compute confidenceScore" is a hard requirement from the build plan.
const prompt = ChatPromptTemplate.fromTemplate(`
You are a senior investment analyst and the final decision-maker.

Chart Analyst Report (Agent A): {agent_a_output}
Macro Analyst Report  (Agent B): {agent_b_output}
Agent B available: {agent_b_available}

Your job is to decide whether Agent A and Agent B AGREE or DISAGREE,
and to write a plain-English explanation of your reasoning.

Two agents AGREE when their overall direction is consistent:
  - Agent A bullish + Agent B positive → agree
  - Agent A bearish + Agent B negative → agree
  - Any other combination where the signals conflict → disagree

If Agent B was unavailable (agent_b_available = false), set agreement to true
and note in your reasoning that only chart data was available.

Always explain your reasoning in at least 3 complete sentences.
Do NOT compute or include a confidenceScore — that is calculated by the server.

Output ONLY a valid JSON object, no markdown fences, no extra text:
{{
  "agreement": <boolean>,
  "conflictFlag": "<one sentence describing the conflict, or null if agreement is true>",
  "reasoning": "<string, minimum 3 sentences>"
}}
`);

// ── Chain export — agentController awaits this after A+B settle ───────────────
export const agentCChain = prompt.pipe(model);

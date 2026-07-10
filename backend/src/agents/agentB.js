/**
 * agentB.js — Document Sentiment Analyst
 * Architecture §6.2
 *
 * Receives RAG-retrieved context from Pinecone (via ragService.queryKnowledgeBase).
 * Synthesises a macroeconomic sentiment purely from the document passages.
 * No chart data — text/document signal only.
 *
 * Input variables:
 *   rag_context — formatted string of retrieved chunks with [Source, Page] citations
 *   sector      — the company's sector (e.g. 'Financial Services', 'Energy')
 *
 * Output: JSON string → { sentiment, evidence, confidence }
 *   sentiment  : 'positive' | 'negative' | 'neutral'
 *   evidence   : cited passage with [FileName, Page X] inline citation
 *   confidence : integer 0–50
 *
 * CRITICAL: Always use safeParseJSON() on the output — never JSON.parse() directly.
 * CRITICAL: agentBAvailable = false when confidence = 0 (parse fallback) — §6.4.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

// ── Gemini model — same version as agentA ────────────────────────────────────
const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model:  'gemini-2.5-flash',
});

// ── Prompt — Architecture §6.2 ───────────────────────────────────────────────
const prompt = ChatPromptTemplate.fromTemplate(`
You are a macroeconomic analyst. You have been given excerpts from official
central bank documents (RBI, Federal Reserve, ECB).

Retrieved document context:
{rag_context}

Based ONLY on the above documents, what is the macroeconomic outlook
for companies in the {sector} sector?

Output ONLY a valid JSON object, no extra text:
{{
  "sentiment": "positive"|"negative"|"neutral",
  "evidence": "<cited passage with [FileName, Page X]>",
  "confidence": <integer 0-50>
}}
`);

// ── Chain export — agentController invokes this alongside agentAChain ─────────
export const agentBChain = prompt.pipe(model);

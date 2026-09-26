import { z } from 'zod';

export const locatorSchema = z.object({ page: z.number().int().positive().optional(), paragraph: z.number().int().positive(), endPage: z.number().int().positive().optional(), endParagraph: z.number().int().positive().optional() });
export const extractionSchema = z.object({
  text: z.string().max(500_000),
  pageMap: z.array(z.object({ text: z.string(), locator: locatorSchema, offset: z.number().int().nonnegative() })),
  pageCount: z.number().int().nonnegative().nullable(), warnings: z.array(z.string()),
});

export type Extraction = z.infer<typeof extractionSchema>;

type Block = Extraction['pageMap'][number];
const heading = /^(?:requirements?|acceptance criteria|login and password reset|sample requirements|user stor(?:y|ies))\s*[:.]?$/i;
const clausePrefix = /^(?:#{1,6}\s*|\d+(?:\.\d+)*[.)]\s+|(?:REQ|AC|FR|NFR|BR|US)-?\d+[.:)]?\s+|[-*•]\s+)/i;
const storyStart = /^as\s+(?:an?\s+)?[^,]+,?\s+i\s+(?:want|need|should|can)\b/i;
const storyContinuation = /^(?:i\s+want\b|so\s+that\b)/i;

function stripPrefix(text: string) {
  return text.replace(/^#{1,6}\s*/, '').replace(/^(?:\d+(?:\.\d+)*[.)]|(?:REQ|AC|FR|NFR|BR|US)-?\d+[.:)]?|[-*•])\s*/i, '').trim();
}
function locatorFor(blocks: Block[]) {
  const first = blocks[0].locator, last = blocks.at(-1)!.locator;
  return { ...(first.page ? { page: first.page } : {}), paragraph: first.paragraph, ...(last.page && last.page !== first.page ? { endPage: last.page } : {}), ...(last.paragraph !== first.paragraph ? { endParagraph: last.paragraph } : {}) };
}

/** Groups hard-wrapped source lines while retaining the first-to-last source range. */
export function segmentRequirements(extraction: Extraction) {
  const candidates: Array<{text:string;excerpt:string;sourceLocator:ReturnType<typeof locatorFor>;confidence:string}> = [];
  let current: Block[] = [], storyMode = false;
  const flush = () => {
    if (!current.length) return;
    const excerpt = current.map(block => block.text).join('\n');
    const text = stripPrefix(current.map(block => block.text).join(' '));
    if (text.length > 10) candidates.push({ text, excerpt, sourceLocator: locatorFor(current), confidence: clausePrefix.test(current[0].text) || /\b(must|shall|should|when|given|then)\b/i.test(text) ? 'high' : 'review' });
    current = [];
  };
  const blocks = extraction.pageMap.flatMap(block => block.text.split(/\s+(?=(?:\d+(?:\.\d+)*[.)]|(?:REQ|AC|FR|NFR|BR|US)-?\d+[.:)]?)\s+)/i).map(text => ({ ...block, text })));
  for (const block of blocks) {
    const text = block.text.trim();
    if (!text) continue;
    if (heading.test(text)) { flush(); if (/^acceptance criteria/i.test(text)) storyMode = false; continue; }
    const startsClause = clausePrefix.test(text), startsStory = storyStart.test(text), continuesStory = storyMode && storyContinuation.test(text);
    const previousEndsSentence = current.length > 0 && /[.!?;:]$/.test(current.at(-1)!.text.trim());
    if (startsClause || startsStory || (!continuesStory && previousEndsSentence)) flush();
    current.push(block);
    if (startsStory) storyMode = true;
    if (startsClause) storyMode = false;
  }
  flush();
  return candidates;
}

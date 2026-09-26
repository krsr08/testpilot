import { z } from 'zod';

export const locatorSchema = z.object({ page: z.number().int().positive().optional(), paragraph: z.number().int().positive() });
export const extractionSchema = z.object({
  text: z.string().max(500_000),
  pageMap: z.array(z.object({ text: z.string(), locator: locatorSchema, offset: z.number().int().nonnegative() })),
  pageCount: z.number().int().nonnegative().nullable(), warnings: z.array(z.string()),
});

export type Extraction = z.infer<typeof extractionSchema>;

export function segmentRequirements(extraction: Extraction) {
  return extraction.pageMap.flatMap((block) => {
    // Preserve every meaningful candidate. Heading-only lines stay in source maps.
    if (block.text.length < 8 || /^(?:requirements|acceptance criteria|login and password reset|sample requirements)\s*[:.]?$/i.test(block.text)) return [];
    const parts = block.text.split(/\s+(?=\d+[.)]\s+(?:[A-Z]|The\b))/).filter(Boolean);
    return parts.map((text) => ({
      text: text.replace(/^\s*(?:\d+[.)]|[-•])\s*/, '').trim(),
      excerpt: text,
      sourceLocator: block.locator,
      confidence: /^\d+[.)]\s/.test(text) || /\b(must|shall|should|when|given|then)\b/i.test(text) ? 'high' : 'review',
    })).filter((requirement) => requirement.text.length > 0);
  });
}

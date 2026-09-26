import { z } from 'zod';
import { ProcessingError } from './extraction';

export const caseTypeSchema = z.enum(['positive', 'negative', 'boundary', 'permission', 'other']);
export type CaseType = z.infer<typeof caseTypeSchema>;
const shortText = z.string().trim().min(1).max(300);
const text = z.string().max(5000);
export const citationLocatorSchema = z.record(z.string(), z.json()).refine((value) => JSON.stringify(value).length <= 8000, 'Locator is too large');
export const snapshotItemSchema = z.object({
  id: z.string().uuid(), stableCode: z.string().min(1).max(50), text: z.string().min(1).max(10_000),
  revision: z.number().int().positive(), sourceId: z.string().uuid().nullable(),
  excerpt: z.string().max(50_000), sourceLocator: citationLocatorSchema, inferred: z.boolean().default(false),
});
export const snapshotSchema = z.array(snapshotItemSchema).min(1).max(100);
export type SnapshotItem = z.infer<typeof snapshotItemSchema>;
export const generatedCaseSchema = z.object({
  title: shortText, type: caseTypeSchema, priority: z.enum(['low', 'medium', 'high']),
  preconditions: text, testData: text, postconditions: text, rationale: text,
  steps: z.array(z.object({ action: z.string().trim().min(1).max(2000), expectedResult: z.string().trim().min(1).max(2000) }).strict()).min(1).max(30),
  requirementIds: z.array(z.string().uuid()).min(1).max(10),
  citations: z.array(z.object({ requirementId: z.string().uuid(), quote: text, locator: citationLocatorSchema, inferred: z.boolean() }).strict()).min(1).max(20),
}).strict();
export const generationSchema = z.object({ scenarios: z.array(z.object({
  title: shortText, description: text,
  requirementIds: z.array(z.string().uuid()).min(1).max(10),
  cases: z.array(generatedCaseSchema).min(1).max(100),
}).strict()).min(1).max(100) }).strict();
export type GenerationOutput = z.infer<typeof generationSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function validateGeneration(output: unknown, snapshot: SnapshotItem[], types: CaseType[]): GenerationOutput {
  const parsed = generationSchema.safeParse(output);
  if (!parsed.success) throw new ProcessingError('Model output is malformed or contains empty fields. No drafts were saved. Retry generation.');
  const known = new Map(snapshot.map((item) => [item.id, item]));
  const covered = new Set<string>();
  const duplicates = new Set<string>();
  let count = 0;
  for (const scenario of parsed.data.scenarios) {
    if (new Set(scenario.requirementIds).size !== scenario.requirementIds.length || scenario.requirementIds.some((id) => !known.has(id))) {
      throw new ProcessingError('Model output references an unknown or duplicate requirement. No drafts were saved.');
    }
    const scenarioCovered = new Set<string>();
    for (const testCase of scenario.cases) {
      count++;
      if (!types.includes(testCase.type)) throw new ProcessingError('Model output contains an unrequested test type. No drafts were saved.');
      if (new Set(testCase.requirementIds).size !== testCase.requirementIds.length || testCase.requirementIds.some((id) => !known.has(id) || !scenario.requirementIds.includes(id))) {
        throw new ProcessingError('Model output has missing or unknown requirement links. No drafts were saved.');
      }
      const key = JSON.stringify([testCase.title.trim().toLowerCase(), testCase.steps.map((step) => [step.action.trim().toLowerCase(), step.expectedResult.trim().toLowerCase()])]);
      if (duplicates.has(key)) throw new ProcessingError('Model output contains exact duplicate test cases. No drafts were saved.');
      duplicates.add(key);
      for (const id of testCase.requirementIds) { covered.add(id); scenarioCovered.add(id); }
      for (const citation of testCase.citations) {
        const requirement = known.get(citation.requirementId);
        if (!requirement || !testCase.requirementIds.includes(citation.requirementId)) throw new ProcessingError('Model output has a citation to an unlinked requirement. No drafts were saved.');
        if (!citation.inferred && (!requirement.sourceId || !citation.quote.trim() || !requirement.excerpt.includes(citation.quote) || canonical(citation.locator) !== canonical(requirement.sourceLocator))) {
          throw new ProcessingError('Model output contains an unsupported source quote or locator. No drafts were saved.');
        }
        if (citation.inferred && (citation.quote !== '' || Object.keys(citation.locator).length !== 0)) {
          throw new ProcessingError('Inferred citations must not invent quotes or locators. No drafts were saved.');
        }
      }
      if (testCase.requirementIds.some((id) => !testCase.citations.some((citation) => citation.requirementId === id))) {
        throw new ProcessingError('Model output is missing requirement citations. No drafts were saved.');
      }
    }
    if (scenario.requirementIds.some((id) => !scenarioCovered.has(id))) throw new ProcessingError('A scenario loses a requirement link. No drafts were saved.');
  }
  if (count > 500) throw new ProcessingError('Generation exceeds 500 cases. Choose fewer requirements or test types. No drafts were saved.');
  if (snapshot.some((item) => !covered.has(item.id))) throw new ProcessingError('Model output omitted a requirement. No drafts were saved. Retry generation.');
  return parsed.data;
}

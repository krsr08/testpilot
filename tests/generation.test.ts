import { describe, expect, it } from 'vitest';
import { fixtureGenerate } from '../services/worker/providers';
import { validateGeneration, type SnapshotItem } from '../services/worker/schemas';

const snapshot: SnapshotItem[] = [{
  id: '10000000-0000-4000-8000-000000000001', stableCode: 'REQ-001', revision: 1,
  text: 'Passwords must contain between 8 and 64 characters inclusive.',
  sourceId: '10000000-0000-4000-8000-000000000002',
  excerpt: '1. Passwords must contain between 8 and 64 characters inclusive.',
  sourceLocator: { page: 1, paragraph: 2 }, inferred: false,
}];

describe('generation contract', () => {
  it('produces reproducible draft candidates with meaningful sample boundaries', () => {
    const first = fixtureGenerate(snapshot, ['positive', 'boundary']);
    expect(first).toEqual(fixtureGenerate(snapshot, ['positive', 'boundary']));
    expect(validateGeneration(first, snapshot, ['positive', 'boundary'])).toEqual(first);
    expect(first.scenarios[0].cases[1].steps[0].action).toContain('7, 8, 64, and 65');
    expect(first.scenarios[0].cases[0].citations.some(citation => citation.inferred)).toBe(true);
  });

  it('supports merged requirement locators and long reviewed text', () => {
    const merged = [{ ...snapshot[0], text: 'The application must validate input. '.repeat(250), sourceLocator: { parts: [{ paragraph: 1 }, { paragraph: 2 }] } }];
    expect(() => validateGeneration(fixtureGenerate(merged, ['positive']), merged, ['positive'])).not.toThrow();
  });

  it.each(['unknown ID', 'quote', 'locator', 'empty expected result', 'duplicate', 'inferred evidence', 'missing requirement'])('rejects %s before persistence', (fault) => {
    const output = fixtureGenerate(snapshot, ['positive']);
    const testCase = output.scenarios[0].cases[0];
    if (fault === 'unknown ID') testCase.requirementIds = ['20000000-0000-4000-8000-000000000001'];
    if (fault === 'quote') testCase.citations[0].quote = 'Fabricated evidence';
    if (fault === 'locator') testCase.citations[0].locator = { page: 999, paragraph: 2 };
    if (fault === 'empty expected result') testCase.steps[0].expectedResult = '';
    if (fault === 'duplicate') output.scenarios[0].cases.push(structuredClone(testCase));
    if (fault === 'inferred evidence') testCase.citations[1].quote = 'Invented quote';
    if (fault === 'missing requirement') output.scenarios = [];
    expect(() => validateGeneration(output, snapshot, ['positive'])).toThrow();
  });
});

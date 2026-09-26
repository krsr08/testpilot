import { Prisma, type PrismaClient } from '@prisma/client';
import { db } from '../../../packages/db';

type TraceabilityClient = Pick<PrismaClient | Prisma.TransactionClient, 'requirement' | 'testCase' | 'sourceCitation'>;
type Warning = { severity: 'info' | 'warning' | 'error'; entityId: string; issue: string; action: string };

export async function buildTraceability(projectId: string, approvedOnly = false, client: TraceabilityClient = db) {
  const [requirements, storedCases] = await Promise.all([
    client.requirement.findMany({ where: { projectId, deletedAt: null }, include: { source: true }, orderBy: { stableCode: 'asc' } }),
    client.testCase.findMany({
      where: { projectId, deletedAt: null },
      include: { steps: { orderBy: { position: 'asc' } }, links: { include: { requirement: true } }, scenario: true, run: true },
      orderBy: { stableCode: 'asc' },
    }),
  ]);
  const activeCases = storedCases.filter(testCase => testCase.status !== 'rejected');
  const selectedCases = approvedOnly ? activeCases.filter(testCase => testCase.status === 'approved') : activeCases;
  const citations = selectedCases.length ? await client.sourceCitation.findMany({ where: { entityType: 'test_case', entityId: { in: selectedCases.map(testCase => testCase.id) } }, include: { source: true } }) : [];
  const cases = selectedCases.map(testCase => ({ ...testCase, citations: citations.filter(citation => citation.entityId === testCase.id) }));
  const warnings: Warning[] = [];
  const rows = requirements.map(requirement => {
    const linked = cases.filter(testCase => testCase.links.some(link => link.requirementId === requirement.id));
    const counts = { positive: 0, negative: 0, boundary: 0, permission: 0, other: 0 };
    for (const testCase of linked) if (testCase.type in counts) counts[testCase.type as keyof typeof counts]++;
    const coverage: 'covered' | 'needs review' | 'uncovered' = linked.length === 0 ? 'uncovered'
      : linked.some(testCase => testCase.status === 'approved' && !testCase.stale) ? 'covered' : 'needs review';
    if (!requirement.included) {
      warnings.push({ severity: 'info', entityId: requirement.stableCode, issue: `Requirement is out of scope${requirement.outOfScopeReason ? `: ${requirement.outOfScopeReason}` : '; no reason was recorded'}.`, action: 'Confirm the exclusion and its reason with the reviewer.' });
    } else if (coverage === 'uncovered') {
      const excludedByFilter = approvedOnly && activeCases.some(testCase => testCase.links.some(link => link.requirementId === requirement.id));
      warnings.push({ severity: 'warning', entityId: requirement.stableCode, issue: excludedByFilter ? 'No approved active case covers this requirement in the approved-only selection.' : 'Requirement has no active linked test case.', action: 'Add or link an appropriate case, then review and approve it.' });
    } else if (coverage === 'needs review') {
      warnings.push({ severity: 'warning', entityId: requirement.stableCode, issue: 'Linked cases still require review or are stale.', action: 'Review the linked drafts and reconcile stale cases.' });
    }
    if (requirement.included && (requirement.inferred || requirement.confidence === 'review')) {
      warnings.push({ severity: 'warning', entityId: requirement.stableCode, issue: 'Requirement extraction or interpretation needs clarification.', action: 'Inspect the original excerpt and confirm the intended rule.' });
    }
    return {
      requirement, scenarios: Array.from(new Map(linked.filter(testCase => testCase.scenario).map(testCase => [testCase.scenario!.id, testCase.scenario!])).values()),
      cases: linked, counts, coverage, inScope: requirement.included,
    };
  });
  const knownRequirements = new Set(requirements.map(requirement => requirement.id));
  const orphans = cases.filter(testCase => !testCase.links.some(link => knownRequirements.has(link.requirementId)));
  for (const testCase of cases) {
    if (testCase.stale) warnings.push({ severity: 'warning', entityId: testCase.stableCode, issue: 'Case is stale after a requirement revision.', action: 'Compare it with the latest requirement and retain, edit, or regenerate deliberately.' });
    if (testCase.citations.some(citation => citation.inferred)) warnings.push({ severity: 'warning', entityId: testCase.stableCode, issue: 'Case includes inferred assumptions or test conditions.', action: 'Verify inferred details before relying on this case.' });
    if (testCase.citations.length === 0) warnings.push({ severity: 'warning', entityId: testCase.stableCode, issue: 'Case has no source citations.', action: 'Add a source-grounded link or document that this is a manual inferred case.' });
  }
  for (const testCase of orphans) warnings.push({ severity: 'warning', entityId: testCase.stableCode, issue: 'Case has no linked active requirement.', action: 'Link a requirement or document why this case stands alone.' });
  if (cases.some(testCase => testCase.run?.provider === 'fixture')) warnings.push({ severity: 'info', entityId: projectId, issue: 'Demo generation produced deterministic suggestions; they are not exhaustive.', action: 'Review test quality and completeness independently.' });
  if (approvedOnly && activeCases.length > selectedCases.length) warnings.push({ severity: 'info', entityId: projectId, issue: `${activeCases.length - selectedCases.length} unapproved case(s) excluded by approved-only filtering.`, action: 'Review omitted drafts before exporting them in a later selection.' });
  const uncovered = rows.filter(row => row.requirement.included && row.coverage === 'uncovered');
  const ambiguous = rows.filter(row => row.requirement.included && (row.requirement.inferred || row.requirement.confidence === 'review'));
  return {
    rows, uncovered, ambiguous, orphans, warnings,
    counts: {
      requirements: requirements.length, includedRequirements: requirements.filter(requirement => requirement.included).length,
      cases: cases.length, approved: cases.filter(testCase => testCase.status === 'approved').length,
      draft: cases.filter(testCase => testCase.status === 'draft').length,
      rejected: storedCases.filter(testCase => testCase.status === 'rejected').length,
      stale: cases.filter(testCase => testCase.stale).length, uncovered: uncovered.length,
    },
  };
}

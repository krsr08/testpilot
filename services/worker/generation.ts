import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../../packages/db';
import { ProcessingError } from './extraction';
import { fixtureGenerate, generateExternal } from './providers';
import { caseTypeSchema, snapshotSchema, validateGeneration, type GenerationOutput } from './schemas';

export async function generateCases(jobId: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  const run = await db.generationRun.findUniqueOrThrow({ where: { id: job.entityId }, include: { snapshot: true, project: true } });
  if (run.status === 'succeeded') return;
  await db.generationRun.update({ where: { id: run.id }, data: { status: 'running', startedAt: new Date(), error: null, completedAt: null } });
  try {
    const snapshotResult = snapshotSchema.safeParse(run.snapshot.items);
    const typesResult = z.array(caseTypeSchema).min(1).max(5).safeParse(run.types);
    if (!snapshotResult.success || !typesResult.success || new Set(typesResult.data).size !== typesResult.data.length) {
      throw new ProcessingError('Snapshot or requested types are invalid. Confirm 1–100 requirements and retry.');
    }
    if (run.snapshot.projectId !== run.projectId || run.snapshotHash !== run.snapshot.hash) throw new ProcessingError('Snapshot does not match this project or run. Confirm requirements again.');
    const snapshot = snapshotResult.data;
    const types = typesResult.data;
    const combined: GenerationOutput = { scenarios: [] };
    for (let offset = 0; offset < snapshot.length; offset += 10) {
      const batch = snapshot.slice(offset, offset + 10);
      await db.job.update({ where: { id: jobId }, data: { stage: `generating batch ${Math.floor(offset / 10) + 1} of ${Math.ceil(snapshot.length / 10)}`, progress: 10 + Math.floor(offset / snapshot.length * 65) } });
      const output = run.provider === 'fixture' ? fixtureGenerate(batch, types)
        : run.provider === 'external' ? await generateExternal(batch, types, run.project.domain)
          : (() => { throw new ProcessingError('Unknown generation provider. Select Demo generation or configure the external provider.'); })();
      combined.scenarios.push(...validateGeneration(output, batch, types).scenarios);
    }
    const validated = validateGeneration(combined, snapshot, types);
    const caseCount = validated.scenarios.reduce((sum, scenario) => sum + scenario.cases.length, 0);
    await db.job.update({ where: { id: jobId }, data: { stage: 'saving validated drafts', progress: 85 } });
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${run.projectId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "GenerationRun" WHERE id = ${run.id}::uuid FOR UPDATE`;
      const currentRun = await tx.generationRun.findUniqueOrThrow({ where: { id: run.id } });
      if (currentRun.status === 'succeeded') return;
      // Hold requirement locks until case links commit so edits cannot miss stale propagation.
      await tx.$queryRaw`SELECT id FROM "Requirement" WHERE "projectId" = ${run.projectId}::uuid FOR UPDATE`;
      const currentRequirements = await tx.requirement.findMany({ where: { projectId: run.projectId, id: { in: snapshot.map((item) => item.id) } }, select: { id: true, revision: true, deletedAt: true } });
      const revisions = new Map(currentRequirements.map((requirement) => [requirement.id, requirement]));
      const input = new Map(snapshot.map((requirement) => [requirement.id, requirement]));
      const project = await tx.project.update({ where: { id: run.projectId }, data: {
        scenarioCounter: { increment: validated.scenarios.length }, caseCounter: { increment: caseCount }, updatedBy: job.createdBy,
      } });
      let scenarioNumber = project.scenarioCounter - validated.scenarios.length + 1;
      let caseNumber = project.caseCounter - caseCount + 1;
      const approvedStories = await tx.userStory.findMany({ where: { projectId: run.projectId, state: 'APPROVED' }, include: { requirementLinks: true } });
      for (const candidate of validated.scenarios) {
        const scenarioRequirementIds = new Set(candidate.cases.flatMap(item => item.requirementIds));
        const linkedStory = approvedStories.find(item => item.requirementLinks.some(link => scenarioRequirementIds.has(link.requirementId)));
        const scenario = await tx.scenario.create({ data: {
          projectId: run.projectId, runId: run.id, storyId: linkedStory?.id, stableCode: `SCN-${String(scenarioNumber++).padStart(3, '0')}`,
          title: candidate.title, description: candidate.description, createdBy: job.createdBy, updatedBy: job.createdBy,
        } });
        for (const candidateCase of candidate.cases) {
          const stale = candidateCase.requirementIds.some((id) => revisions.get(id)?.revision !== input.get(id)?.revision || revisions.get(id)?.deletedAt !== null);
          const testCase = await tx.testCase.create({ data: {
            projectId: run.projectId, scenarioId: scenario.id, runId: run.id,
            stableCode: `TC-${String(caseNumber++).padStart(3, '0')}`,
            title: candidateCase.title, type: candidateCase.type, priority: candidateCase.priority,
            preconditions: candidateCase.preconditions, testData: candidateCase.testData,
            postconditions: candidateCase.postconditions, rationale: candidateCase.rationale,
            stale, createdBy: job.createdBy, updatedBy: job.createdBy,
            steps: { create: candidateCase.steps.map((step, index) => ({ position: index + 1, ...step })) },
            links: { create: candidateCase.requirementIds.map((requirementId) => ({ requirementId, rationale: candidateCase.rationale, createdBy: job.createdBy })) },
          } });
          await tx.sourceCitation.createMany({ data: candidateCase.citations.map((citation) => ({
            entityType: 'test_case', entityId: testCase.id,
            sourceId: citation.inferred ? null : input.get(citation.requirementId)!.sourceId,
            locator: citation.locator, quote: citation.quote, inferred: citation.inferred,
          })) });
          await tx.testCaseRevision.create({ data: {
            testCaseId: testCase.id, version: 1, reason: 'generated', createdBy: job.createdBy,
            data: { ...candidateCase, stableCode: testCase.stableCode, status: 'draft', stale, version: 1 } as Prisma.InputJsonValue,
          } });
        }
      }
      await tx.generationRun.update({ where: { id: run.id }, data: {
        status: 'succeeded', completedAt: new Date(), error: null,
        warnings: run.provider === 'fixture' ? ['Demo generation: deterministic suggestions include inferred setup and conditions. Human review is required; coverage is not exhaustive.'] : ['AI output is a draft and requires human review.'],
      } });
      await tx.auditEvent.create({ data: {
        projectId: run.projectId, actorId: job.createdBy, action: 'generation_completed', entityType: 'generation', entityId: run.id,
        afterJson: { scenarios: validated.scenarios.length, cases: caseCount, provider: run.provider, snapshotHash: run.snapshotHash },
      } });
    }, { timeout: 60_000 });
  } catch (error) {
    const message = error instanceof ProcessingError ? error.message : 'Generation could not be completed. No drafts were saved. Retry or check worker configuration.';
    await db.$transaction([
      db.generationRun.update({ where: { id: run.id }, data: { status: 'failed', error: message, completedAt: new Date() } }),
      db.auditEvent.create({ data: {
        projectId: run.projectId, actorId: job.createdBy, action: 'generation_failed', entityType: 'generation', entityId: run.id,
        afterJson: { category: 'generation_failure', provider: run.provider },
      } }),
    ]);
    throw new ProcessingError(message, { cause: error });
  }
}

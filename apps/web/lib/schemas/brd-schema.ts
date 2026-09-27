import {z} from 'zod';

export const BRDGenerationInputSchema=z.object({
 title:z.string().trim().min(3).max(120),projectType:z.enum(['APPLICATION','API','MOBILE','DATA','INTEGRATION','MIGRATION','OTHER']),overview:z.string().trim().min(20).max(5000),users:z.string().trim().min(3).max(2000),inScope:z.string().max(5000).default(''),outOfScope:z.string().max(5000).default(''),capabilities:z.string().trim().min(10).max(8000),businessRules:z.string().max(8000).default(''),integrations:z.string().max(5000).default(''),assumptionsRisks:z.string().max(5000).default(''),constraints:z.string().max(5000).default(''),acceptanceCriteria:z.string().max(8000).default('')
}).strict();

export const BRDAnalysisSchema=z.object({
 completenessScore:z.number().min(0).max(100),
 ambiguityFlags:z.array(z.object({term:z.string().trim().min(1).max(160),reason:z.string().trim().min(1).max(1000),suggestedRewrite:z.string().trim().min(1).max(2000)}).strict()).max(100),
 gherkinFeatures:z.array(z.object({title:z.string().trim().min(3).max(200),featureText:z.string().trim().min(40).max(20000).refine(value=>/^Feature:/m.test(value)&&/^\s*Scenario(?: Outline)?:/m.test(value)&&/^\s*Given\s+/m.test(value)&&/^\s*When\s+/m.test(value)&&/^\s*Then\s+/m.test(value),{message:'featureText must contain Feature, Scenario, Given, When, and Then statements'})}).strict()).min(1).max(100)
}).strict();

export type BRDGenerationInput=z.infer<typeof BRDGenerationInputSchema>;
export type BRDAnalysis=z.infer<typeof BRDAnalysisSchema>;

import {describe,expect,it} from 'vitest';
import corpus from '../fixtures/regression-requirements.json';
import {analyzeBRD,critiqueBRD} from '../apps/web/lib/ai/self-healing-engine';
import {BRDAnalysisSchema,BRDCritiqueSchema} from '../apps/web/lib/schemas/brd-schema';

describe('requirement intelligence regression gate',()=>{
 it('keeps the 20-document corpus within the five percent quality budget',async()=>{
  const regressions:string[]=[];
  for(const sample of corpus){
   const {id:sampleId,minScore,expectedFlags,...input}=sample;
   const result=await analyzeBRD(input,{mode:'fixture'});
   BRDAnalysisSchema.parse(result.analysis);
   const critique=critiqueBRD(input,result.analysis);
   BRDCritiqueSchema.parse(critique);
   if(result.analysis.completenessScore<minScore)regressions.push(`${sampleId}: score ${result.analysis.completenessScore} < ${minScore}`);
   if(expectedFlags!==undefined&&result.analysis.ambiguityFlags.length<expectedFlags)regressions.push(`${sampleId}: expected ${expectedFlags} ambiguity flags`);
   for(const feature of result.analysis.gherkinFeatures)expect(feature.featureText).toMatch(/^Feature:[\s\S]+Scenario:[\s\S]+Given[\s\S]+When[\s\S]+Then/m);
  }
  expect(regressions.length/corpus.length).toBeLessThanOrEqual(.05);
 },30000);
});


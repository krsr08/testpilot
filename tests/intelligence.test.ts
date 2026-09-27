import {describe,expect,it} from 'vitest';
import {diffSnapshots,generatePlaywrightArtifact,semanticSimilarity} from '../apps/web/lib/intelligence-api';

describe('quality intelligence',()=>{
 it('classifies every changed linked requirement without false negatives',()=>{
  const before=[{id:'r1',stableCode:'REQ-001',text:'The system shall allow login.',revision:1},{id:'r2',stableCode:'REQ-002',text:'Reset links expire after 30 minutes.',revision:1},{id:'r3',stableCode:'REQ-003',text:'Audit successful login.',revision:1}];
  const after=[{id:'r1',stableCode:'REQ-001',text:'The system shall allow login with MFA.',revision:2},{id:'r2',stableCode:'REQ-002',text:'Reset links expire after 30 minutes.',revision:1},{id:'r4',stableCode:'REQ-004',text:'Lock after five failures.',revision:1}];
  const changes=diffSnapshots(before,after,new Map([['r1',['tc1']],['r3',['tc2']]]));
  expect(changes.map(item=>[item.stableCode,item.kind])).toEqual([['REQ-001','MODIFIED'],['REQ-002','UNCHANGED'],['REQ-003','DELETED'],['REQ-004','ADDED']]);
  expect(new Set(changes.flatMap(item=>item.affectedCaseIds))).toEqual(new Set(['tc1','tc2']));
  expect(semanticSimilarity(before[0].text,after[0].text)).toBeGreaterThan(.5);
 });
 it('emits runnable Playwright structure with ranked safe fallbacks',()=>{
  const result=generatePlaywrightArtifact({stableCode:'TC-007',title:'Submit transfer',preconditions:'Signed in',steps:[{action:'Select Submit transfer',expectedResult:'Confirmation appears'}]});
  expect(result.filename).toMatch(/^tc-007-/);
  expect(result.source).toContain("from '@playwright/test'");
  expect(result.source).toContain('TESTPILOT_SELECTOR_FALLBACK');
  expect(result.selectors[0].candidates.map(item=>item.kind)).toEqual(['testId','role','text']);
 });
});

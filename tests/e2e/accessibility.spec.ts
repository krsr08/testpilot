import AxeBuilder from '@axe-core/playwright';
import {expect,test} from '@playwright/test';

for(const route of ['/projects','/workspace','/integrations','/operations'])test(`${route} has no serious or critical accessibility violations`,async({page})=>{
 await page.goto(route);await expect(page.locator('h1')).toBeVisible();await expect(page.locator('.skeleton')).toHaveCount(0);
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
 expect(result.violations.filter(item=>['serious','critical'].includes(item.impact||'')),result.violations.map(item=>`${item.id}: ${item.help}`).join('\n')).toEqual([]);
});

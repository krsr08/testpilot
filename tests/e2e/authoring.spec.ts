import {expect,test} from '@playwright/test';

test('guides a new project into persistent requirements authoring',async({page})=>{
 const name=`Authoring ${Date.now()}`;
 await page.goto('/projects');
 await page.getByRole('button',{name:'Create project',exact:true}).click();
 await page.getByLabel(/Project title/).fill(name);
 await page.getByRole('button',{name:'Create project',exact:true}).last().click();
 await expect(page.getByRole('heading',{name:`Add requirements for ${name}`})).toBeVisible();
 await page.getByRole('button',{name:/Create a requirements document/}).click();
 await expect(page).toHaveURL(/\/requirements\/author$/);
 await page.getByRole('button',{name:/Simple PRD/}).click();
 await expect(page.getByLabel('Requirements document content')).toContainText('Functional requirements');
 await page.getByLabel('Requirements document content').fill('# Customer Portal\n\n## Functional requirements\nFR-001. The system shall allow secure sign in.\n\n## Acceptance criteria\nAC-001. Valid credentials open the dashboard.');
 await page.getByRole('button',{name:'Save now'}).click();
 await expect(page.getByText(/Saved version 2/)).toBeVisible();
 await expect(page.getByRole('link',{name:'Download DOCX'})).toHaveAttribute('href',/format=docx/);
});

test('recovers an enterprise AI brief after closing the builder',async({page})=>{
 await page.goto('/projects');
 await page.getByRole('button',{name:'Create requirements document'}).click();
 await page.getByLabel('Document title').fill('Claims Modernisation BRD');
 await page.getByLabel('Product overview').fill('Modernise claims intake and assessment for commercial insurance customers.');
 await page.getByLabel('Primary users').fill('Claims handlers and underwriting reviewers');
 await page.getByLabel('In-scope items').fill('Digital claim intake and assessment');
 await page.getByLabel('Out-of-scope items').fill('Policy underwriting');
 await page.getByLabel('Capabilities').fill('submit a claim\nreview claim evidence');
 await page.getByLabel('Integrations and system dependencies').fill('Corporate identity provider');
 await page.getByLabel('Assumptions and risks').fill('Legacy claim identifiers remain stable');
 await page.getByRole('button',{name:'Save draft'}).click();
 await expect(page.getByRole('status')).toContainText('Draft saved');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Create requirements document'}).click();
 await expect(page.getByLabel('Out-of-scope items')).toHaveValue('Policy underwriting');
 await expect(page.getByLabel('Integrations and system dependencies')).toHaveValue('Corporate identity provider');
});

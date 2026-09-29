import {describe,expect,it} from 'vitest';
import {api,jsonRequest} from '../helpers';

describe('deployment configuration API',()=>{
 it('persists administrator configuration without accepting raw secrets',async()=>{
  const initial=await api('/enterprise/platform-config');
  expect(initial.status).toBe(200);
  const prior=(await initial.json()).values;
  try{
   const saved=await api('/enterprise/platform-config',jsonRequest('PUT',{values:{APP_URL:'https://testpilot.example.com',GENERATOR_MODE:'external',MODEL_API_KEY_REF:'vault://testpilot/model-api-key',CLAMAV_ENABLED:'true'}}));
   expect(saved.status).toBe(200);
   expect((await saved.json()).values).toMatchObject({APP_URL:'https://testpilot.example.com',MODEL_API_KEY_REF:'vault://testpilot/model-api-key'});
   const rejected=await api('/enterprise/platform-config',jsonRequest('PUT',{values:{MODEL_API_KEY_REF:'sk-live-this-must-not-be-stored'}}));
   expect(rejected.status).toBe(422);
   expect(await rejected.text()).toContain('Never enter a secret value');
  }finally{await api('/enterprise/platform-config',jsonRequest('PUT',{values:prior}));}
 });
});

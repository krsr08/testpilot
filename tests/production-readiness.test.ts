import {describe,expect,it} from 'vitest';
import {validateProductionEnvironment} from '../scripts/validate-production-env';

const valid={APP_ENV:'production',DEMO_AUTH:'false',APP_URL:'https://testpilot.example.com',DATABASE_URL:'postgresql://user:pass@db:5432/testpilot',REDIS_URL:'rediss://redis:6379',STORAGE_MODE:'s3',AWS_REGION:'us-east-1',S3_BUCKET_NAME:'testpilot-production',CLAMAV_ENABLED:'true',CLAMAV_HOST:'clamav.internal',OIDC_ISSUER:'https://identity.example.com',OIDC_AUDIENCE:'testpilot-api',OIDC_JWKS_URL:'https://identity.example.com/jwks',OIDC_CLIENT_ID:'client',OIDC_AUTHORIZATION_URL:'https://identity.example.com/authorize',OIDC_TOKEN_URL:'https://identity.example.com/token',SCIM_BEARER_TOKEN:'a'.repeat(32),SCIM_WORKSPACE_ID:'00000000-0000-4000-8000-000000000000',METRICS_BEARER_TOKEN:'b'.repeat(32),OTEL_EXPORTER_OTLP_ENDPOINT:'https://telemetry.example.com/v1/traces',READINESS_MAX_QUEUE_LAG_SECONDS:'300'};
describe('production configuration release gate',()=>{
 it('accepts the documented secure production profile',()=>expect(validateProductionEnvironment(valid).success).toBe(true));
 it('rejects demo authentication, insecure URLs, and missing production services',()=>{const result=validateProductionEnvironment({...valid,DEMO_AUTH:'true',APP_URL:'http://localhost:3000',STORAGE_MODE:'local',CLAMAV_ENABLED:'false'});expect(result.success).toBe(false);if(!result.success)expect(result.error.issues.map(issue=>issue.path[0])).toEqual(expect.arrayContaining(['DEMO_AUTH','APP_URL','STORAGE_MODE','CLAMAV_ENABLED']));});
});

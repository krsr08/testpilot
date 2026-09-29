import {config} from 'dotenv';
import {z} from 'zod';

config({path:process.argv[2]||'.env'});
const httpsUrl=z.string().url().refine(value=>new URL(value).protocol==='https:','must use HTTPS');
export const productionEnvironmentSchema=z.object({
 APP_ENV:z.literal('production'),DEMO_AUTH:z.literal('false'),APP_URL:httpsUrl,
 DATABASE_URL:z.string().startsWith('postgresql://'),REDIS_URL:z.string().startsWith('redis'),
 STORAGE_MODE:z.literal('s3'),AWS_REGION:z.string().min(2),S3_BUCKET_NAME:z.string().min(3),
 CLAMAV_ENABLED:z.literal('true'),CLAMAV_HOST:z.string().min(1),
 OIDC_ISSUER:httpsUrl,OIDC_AUDIENCE:z.string().min(1),OIDC_JWKS_URL:httpsUrl,
 OIDC_CLIENT_ID:z.string().min(1),OIDC_AUTHORIZATION_URL:httpsUrl,OIDC_TOKEN_URL:httpsUrl,
 SCIM_BEARER_TOKEN:z.string().min(24),SCIM_WORKSPACE_ID:z.string().uuid(),
 METRICS_BEARER_TOKEN:z.string().min(24),OTEL_EXPORTER_OTLP_ENDPOINT:httpsUrl,
 READINESS_MAX_QUEUE_LAG_SECONDS:z.coerce.number().int().positive().max(3600)
}).passthrough();

export function validateProductionEnvironment(environment:Record<string,string|undefined>){return productionEnvironmentSchema.safeParse(environment);}
if(import.meta.url===new URL(`file://${process.argv[1].replaceAll('\\','/')}`).href){
 const result=validateProductionEnvironment(process.env);
 if(!result.success){console.error('Production configuration is not ready:');for(const issue of result.error.issues)console.error(`- ${issue.path.join('.')}: ${issue.message}`);process.exitCode=1;}
 else console.log('Production configuration validation passed.');
}

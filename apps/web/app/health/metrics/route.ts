import {timingSafeEqual} from 'node:crypto';
import {db} from '../../../lib/db';

const metric=(name:string,help:string,value:number)=>`# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
function authorized(req:Request){const expected=process.env.METRICS_BEARER_TOKEN||'',provided=req.headers.get('authorization')?.replace(/^Bearer\s+/,'')||'';if(!expected||expected.length!==provided.length)return false;return timingSafeEqual(Buffer.from(expected),Buffer.from(provided));}
export async function GET(req:Request){
 if(!authorized(req))return Response.json({code:'UNAUTHORIZED',message:'A metrics bearer token is required.'},{status:401});
 const since=new Date(Date.now()-24*60*60*1000),[queued,running,failed,completed,failedExports,totalExports]=await Promise.all([db.job.count({where:{status:'queued'}}),db.job.count({where:{status:'running'}}),db.job.count({where:{status:'failed',updatedAt:{gte:since}}}),db.job.count({where:{status:'succeeded',updatedAt:{gte:since}}}),db.export.count({where:{status:'failed',createdAt:{gte:since}}}),db.export.count({where:{createdAt:{gte:since}}})]);
 const body=metric('testpilot_jobs_queued','Jobs waiting for a worker.',queued)+metric('testpilot_jobs_running','Jobs currently running.',running)+metric('testpilot_jobs_failed_24h','Jobs failed during the last 24 hours.',failed)+metric('testpilot_jobs_completed_24h','Jobs completed during the last 24 hours.',completed)+metric('testpilot_exports_failed_24h','Exports failed during the last 24 hours.',failedExports)+metric('testpilot_export_error_ratio_24h','Failed exports divided by all exports during the last 24 hours.',totalExports?failedExports/totalExports:0);
 return new Response(body,{headers:{'content-type':'text/plain; version=0.0.4; charset=utf-8','cache-control':'no-store'}});
}

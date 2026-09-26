import { db } from '../../../lib/db';
import IORedis from 'ioredis';
export async function GET(){const redis=new IORedis(process.env.REDIS_URL||'redis://localhost:56379',{maxRetriesPerRequest:1,lazyConnect:true});try{await db.$queryRaw`SELECT 1`;await redis.connect();await redis.ping();return Response.json({status:'ready',database:'ok',redis:'ok'});}catch{return Response.json({status:'unavailable'},{status:503});}finally{redis.disconnect();}}

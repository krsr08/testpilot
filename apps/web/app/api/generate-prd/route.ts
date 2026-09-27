import {actor,boundedRequest,failure} from '../../../lib/http';
import {analyzeBRD,critiqueBRD,renderAnalyzedDocument} from '../../../lib/ai/self-healing-engine';
export const runtime='nodejs';
export async function POST(request:Request){try{await actor(request);request=await boundedRequest(request);const input=await request.json(),result=await analyzeBRD(input),critique=critiqueBRD(input,result.analysis);return Response.json({...result,critique,document:renderAnalyzedDocument(input,result.analysis)});}catch(error){return failure(error);}}

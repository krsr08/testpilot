import {failure} from '../../../../lib/http';
import {handleStripeEvent} from '../../../../lib/billing-api';
export const runtime='nodejs';
export async function POST(request:Request){try{return Response.json(await handleStripeEvent(request));}catch(error){return failure(error);}}

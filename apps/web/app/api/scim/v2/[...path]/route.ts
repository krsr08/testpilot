import {scimApi} from '../../../../../lib/scim-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(req:Request,context:{params:Promise<{path:string[]}>}){return scimApi(req,(await context.params).path);}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};

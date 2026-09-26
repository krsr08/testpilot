import { Requirements } from '../../../../components/requirements';
export default async function RequirementsPage({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <Requirements id={id}/>; }

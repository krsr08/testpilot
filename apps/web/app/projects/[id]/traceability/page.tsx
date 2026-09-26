import { Traceability } from '../../../../components/traceability';
export default async function TraceabilityPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Traceability id={id}/>;}

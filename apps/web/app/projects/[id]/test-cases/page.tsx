import { Workbench } from '../../../../components/workbench';
export default async function TestCasesPage({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <Workbench id={id}/>; }

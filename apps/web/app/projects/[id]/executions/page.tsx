import {ExecutionCenter} from '../../../../components/execution-center';
export default async function Page({params}:{params:Promise<{id:string}>}){return <ExecutionCenter id={(await params).id}/>}

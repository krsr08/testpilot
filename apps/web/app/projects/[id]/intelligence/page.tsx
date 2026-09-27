import {IntelligenceCenter} from '../../../../components/intelligence-center';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <IntelligenceCenter id={id}/>;}

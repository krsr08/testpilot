import {DocumentRepository} from '../../../../../components/document-repository';

export default async function DocumentRepositoryPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <DocumentRepository projectId={id}/>;}

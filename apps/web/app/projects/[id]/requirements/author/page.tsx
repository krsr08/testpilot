import {RequirementAuthor} from '../../../../../components/requirement-author';
export default async function AuthorRequirementsPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <RequirementAuthor projectId={id}/>;}

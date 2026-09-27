import {StoryWorkbench} from '../../../../components/story-workbench';export default async function Page({params}:{params:Promise<{id:string}>}){return <StoryWorkbench id={(await params).id}/>}

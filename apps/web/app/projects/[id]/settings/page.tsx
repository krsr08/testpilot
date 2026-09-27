import {ProjectSettings} from '../../../../components/project-settings';export default async function Page({params}:{params:Promise<{id:string}>}){return <ProjectSettings id={(await params).id}/>}

import type { EntityManifest } from '../kernel/manifest'
/** Settings fields share Studio controls; DNS verification is an operational status step. */
export const EMAIL_DOMAIN_MANIFEST:EntityManifest={
 entity:'email-domain',label:'Email domain',verify:'none',
 sections:[{key:'domain',title:'Your email domain'},{key:'sender',title:'Sender identity'}],
 fields:[
  {path:'domain',label:'Email domain',kind:'text',section:'domain',required:true,placement:'rail'},
  {path:'localPart',label:'Address name',kind:'text',section:'sender',required:true,placement:'rail'},
  {path:'displayName',label:'Sender name',kind:'text',section:'sender',required:true,placement:'rail'},
  {path:'purpose',label:'Use this sender for',kind:'select',section:'sender',required:true,placement:'rail',options:[
   {value:'conversation',label:'Individual conversations'},{value:'marketing',label:'Campaigns'},{value:'operational',label:'Operational notices'}]},
 ],
}

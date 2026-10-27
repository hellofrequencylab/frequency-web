import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
export function retainedBoardAbout({exists=existsSync,read=file=>readFileSync(file,'utf8')}={}) {
 for(const file of ['components/quest/board-controls.tsx','components/circles/collapsible-about.tsx']) assert(!exists(file), `retired duplicate returned: ${file}`)
 const crew=read('components/frequency/members/crew/leaderboard-body.tsx')
 assert(crew.includes("type Scope = 'circle' | 'hub' | 'global'"),'Crew scopes lost')
 assert(crew.includes("href={href(scope, 'zaps')}"),'Zaps track lost')
 assert(crew.includes("href={href(scope, 'consistency')}"),'Consistency track lost')
 assert(crew.includes('<BoardVisibilitySwitch hidden={hidden} />'),'Crew privacy control lost')
 const circle=read('components/frequency/members/circle/stats-pane.tsx')
 assert(circle.includes("(['effort', 'consistency'] as const)"),'Circle tracks lost')
 assert(circle.includes('!canSeeRows ?'),'Circle row access gate lost')
 assert(circle.includes('<FqBoardHide hidden={optedOut} basePath={base} />'),'Circle privacy control lost')
 const about=read('components/frequency/members/circle/circle-shell.tsx')
 assert(about.includes('{richParagraphs(about)}'),'safe About formatting lost')
 assert(!about.includes('dangerouslySetInnerHTML'),'unsafe About HTML renderer returned')
 return true
}
if(invokedDirectly(import.meta.url)){retainedBoardAbout();console.log('Orphan board/About leaves retired; live scopes, tracks, privacy and safe About retained')}

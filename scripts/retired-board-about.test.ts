import { describe,it,expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { retainedBoardAbout } from './probes/retired-board-about.mjs'
const mutations=[
 ['components/frequency/members/crew/leaderboard-body.tsx','<BoardVisibilitySwitch hidden={hidden} />'],
 ['components/frequency/members/crew/leaderboard-body.tsx',"href={href(scope, 'zaps')}"],
 ['components/frequency/members/circle/stats-pane.tsx','<FqBoardHide hidden={optedOut} basePath={base} />'],
 ['components/frequency/members/circle/stats-pane.tsx','!canSeeRows ?'],
 ['components/frequency/members/circle/circle-shell.tsx','{richParagraphs(about)}'],
]
describe('retirement keeps actual board/About consumers',()=>{
 it('passes the real current tree',()=>expect(retainedBoardAbout()).toBe(true))
 it.each(mutations)('detects removing live behavior from %s (%s)',(path,needle)=>{
  expect(()=>retainedBoardAbout({read:(file:string)=>readFileSync(file,'utf8').replace(file===path?needle:'unused mutation sentinel','')})).toThrow()
 })
})

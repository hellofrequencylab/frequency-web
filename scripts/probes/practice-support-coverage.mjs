#!/usr/bin/env node
// LIVE-2295: actual adopted support coverage and reward displays describe their units without quotas.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { loadProbeModule } from '../lib/probe-module.mjs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const React = require('react')
const jsx = require('react/jsx-runtime')
const { renderToStaticMarkup } = require('react-dom/server')
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']
const slugs = ['mind','body','spirit','expression']
const pillars = ids.map((id,i) => ({ id, slug:slugs[i], name:['Mind','Body','Spirit','Expression'][i], description:null, accent:null, display_order:i }))
const focus = Object.fromEntries(ids.map(id => [id,{instructions:'',timing:''}]))
const practice = { id:'one-practice',domain_id:ids[0],secondary_domain_id:ids[1],focus_details:focus }
const supports = loadProbeModule('lib/practices/support-filter.ts')
let memberReads=0
const reader = loadProbeModule('lib/pillars.ts', {
  '@/lib/practices': { getMemberPractices:async (profileId) => { assert.equal(profileId,'member');memberReads++;return [practice,practice] } },
  '@/lib/practices/support-filter': supports,
  '@/lib/pillars/slugs': {PILLAR_SLUGS:slugs},
  '@/lib/supabase/admin': { createAdminClient:() => ({from:() => { const q={select:()=>q,eq:()=>q,order:async()=>({data:pillars,error:null})};return q }}) },
})
const balance = await reader.getMemberPillarBalance('member')
assert.deepEqual(balance.map(row=>row.count),[1,1,1,1], 'One adopted practice supporting all four areas must count once per area, not only its primary or twice for duplicate membership')
let profileId='member'
const widget = loadProbeModule('components/widgets/practices/practices-balance.tsx', {
 'react/jsx-runtime':jsx,
 'lucide-react':{Scale:()=>null},
 '@/lib/auth':{getMyProfileId:async()=>profileId},
 '@/lib/pillars':{...reader,getPillars:async()=>pillars},
 '@/lib/practices/attribution':{getMemberPillarZaps:async()=>({byPillar:{[ids[0]]:9,[ids[1]]:3},total:12,complete:true})},
 '@/lib/quest/expression-pillar':{ExpressionIcon:()=>null,expressionPillarStyle:()=>({})},
 '@/components/ui/section-header':{SectionHeader:({title})=>React.createElement('h2',null,title)},
 '@/components/ui/progress-track':{ProgressTrack:()=>null},
})
const html=renderToStaticMarkup(await widget.PracticesBalance())
assert.match(html,/Adopted practice supports/)
assert.match(html,/more than one/)
assert.doesNotMatch(html,/\d+%|balance out/)
assert.match(html,/data-pillar-zaps="9"/)
assert.match(html,/data-pillar-zaps="3"/)
assert.match(html,/>12<\/span> Zaps/)
profileId=null
const before=memberReads
assert.equal(await widget.PracticesBalance(),null)
assert.equal(memberReads,before)
const math=loadProbeModule('lib/quest/pillar-balance.ts', {'@/lib/zaps':{practiceLogZaps:()=>{throw Error('Explicit fixture rewards should not use fallback')}},'@/lib/pillars':{PILLAR_SLUGS:slugs}})
const admin=loadProbeModule('components/admin/pillar-balance.tsx',{'react/jsx-runtime':jsx,'lucide-react':{Scale:()=>null},'@/lib/quest/expression-pillar':{ExpressionIcon:()=>null,expressionPillarStyle:()=>({})},'@/lib/quest/pillar-balance':math})
const adminHtml=renderToStaticMarkup(React.createElement(admin.PillarBalance,{practices:[{pillar:'mind',weightClass:null,rewardZaps:10},{pillar:'body',weightClass:null,rewardZaps:3}]}))
assert.match(adminHtml,/Practice reward values/)
assert.match(adminHtml,/per log/)
assert.doesNotMatch(adminHtml,/same daily Zaps|Balance the Pillars| is light| are light|Balanced\./)
const board=readFileSync('components/feed/journey-board.tsx','utf8')
assert.ok(board.includes('Adopted practice supports'))
console.log('Actual support coverage counts each adopted practice once per authored area; member/admin displays preserve reward totals and make no equality quota')

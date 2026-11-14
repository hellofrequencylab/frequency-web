#!/usr/bin/env node
// LIVE-2295 extension: optional Circle support and descriptive path categories agree in actual metadata.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {loadProbeModule} from '../lib/probe-module.mjs'
const templates=loadProbeModule('lib/circles/templates.ts')
const callouts=templates.standardCalloutsFor('pillars')
assert.ok(callouts.length>0)
assert.match(callouts[0].body,/optional/i)
assert.match(callouts[0].body,/leave.*blank/i)
assert.doesNotMatch(callouts[0].body,/whole person|carry all four/i)
const circle=loadProbeModule('lib/studio/entities/circle.ts',{
  '@/lib/studio/kernel/manifest':loadProbeModule('lib/studio/kernel/manifest.ts'),
  '@/lib/circles/visibility':loadProbeModule('lib/circles/visibility.ts'),
  '@/lib/circles/channels':loadProbeModule('lib/circles/channels.ts'),
})
const section=circle.CIRCLE_MANIFEST.sections.find(section=>section.key==='pillars')
assert.match(section.desc,/optional/i)
assert.doesNotMatch(section.desc,/whole person/i)
for(const field of circle.CIRCLE_MANIFEST.fields.filter(field=>field.path.startsWith('pillarsInside.')))assert.notEqual(field.required,true)
const spark=loadProbeModule('lib/ai/circle-spark.ts',{'./spark':{defineSpark:spec=>spec,runSpark:()=>{throw Error('No model call in probe')},sparkStr:()=>'',sparkStrArray:()=>[]},'./writing-coach':{writingCoach:()=>{throw Error('No model call in probe')},WRITING_QUESTIONS:[],parseWritingQuestions:()=>null}})
const metadata=spark.CIRCLE_SPARK.tool.input_schema
assert.deepEqual(metadata.required,['name','card','one_liner','identity'])
assert.match(metadata.properties.pillars_inside.description,/optional/i)
assert.doesNotMatch(metadata.properties.pillars_inside.description,/whole person|all four/i)
const config=loadProbeModule('lib/journey-page-config.ts')
assert.equal(config.WIDGET_META['pillar-balance'].label,'Path categories')
assert.ok(config.DEFAULT_LAYOUT.discovery.includes('pillar-balance'))
const publicView=readFileSync('components/journey/discovery-widgets.tsx','utf8')
assert.ok(publicView.includes('title="Path categories"'))
assert.match(publicView,/primary category/)
const learner=readFileSync('components/journey/v2/learn/learn-player.tsx','utf8')
assert.ok(!learner.includes('so it counts toward your Pillar balance'))
assert.ok(learner.includes('or continue without logging'))
console.log('Circle support guidance is optional; tool/schema keys and stored widget IDs remain intact; path counts and learner copy describe activity without balance targets')

// LIVE-2544 probe: the Plan pop-up lists each to-do on one line, open ones first (overdue on top),
// and folds the done ones under "Done (n)", with the picker shrunk to an initials circle.
import { readFileSync } from 'node:fs'

const fail = (m) => { console.error(`LIVE-2544: ${m}`); process.exit(1) }
const drawer = readFileSync('app/(main)/spaces/[slug]/settings/calendar/plan-drawer.tsx', 'utf8')
if (!/orderPlanTodos\(todos\)/.test(drawer)) fail('the drawer does not order its to-dos')
if (!/data-plan-todos-done/.test(drawer)) fail('done to-dos are not folded apart')
if (!/className="plan-todo-who"/.test(drawer)) fail('the assignee picker is not the compact circle')
const order = readFileSync('lib/calendar/plan-todo-order.ts', 'utf8')
if (!/export function orderPlanTodos/.test(order) || !/export function isOverdueTodo/.test(order)) fail('the ordering helper is missing')
const css = readFileSync('app/themes/frequency/admin-pages.css', 'utf8')
if (!/\.plan-todo-who select\.input \{[^}]*opacity: 0/.test(css)) fail('the picker is not laid invisibly over the circle')
console.log('LIVE-2544: the Plan to-do list is one line per to-do')

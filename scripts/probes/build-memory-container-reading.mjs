// HYG-224: the build-memory sampler must read the whole container (cgroup) and name the biggest processes, because the
// `next`-only reading was 86 MB while the build was being OOM-killed. Exits 1 when that reading is missing or wrong.
import { containerLine, readContainerMemory, topProcesses } from '../check-build-memory.mjs'
const files = { '/sys/fs/cgroup/memory.current': '3145728000', '/sys/fs/cgroup/memory.peak': '6291456000' }
const read = (f) => { if (f in files) return files[f]; throw new Error('missing') }
const c = readContainerMemory(read)
const procs = [{ name: 'a', rssKb: 10 }, { name: 'next-server', rssKb: 4194304 }, { name: 'node', rssKb: 2048 }]
const line = containerLine(c, procs, 70_000)
const checks = [
  ['reads cgroup v2 current and peak in MB', c?.currentMb === 3000 && c?.peakMb === 6000],
  ['returns null when no cgroup file exists', readContainerMemory(() => { throw new Error('x') }) === null],
  ['ranks processes by resident memory', topProcesses(procs)[0].name === 'next-server'],
  ['the log line carries container peak and the biggest process', /70s container 3000 MB now, 6000 MB peak; biggest processes: next-server 4096 MB/.test(line)],
]
let bad = 0
for (const [l, ok] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}`); if (!ok) bad++ }
process.exit(bad ? 1 : 0)

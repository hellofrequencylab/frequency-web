// @vitest-environment node
import { expect, it } from 'vitest'
import { verifyViteFileBoundary } from '../../scripts/probes/vite-file-boundary.mjs'

it('keeps an analyzed project import from authorizing its host-absolute twin', async () => {
  expect(await verifyViteFileBoundary()).toMatchObject({ entryStatus: 200, outsideStatus: 403 })
})

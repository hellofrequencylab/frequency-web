// Metro for Frequency Experience. One addition to Expo's defaults: the app compiles against the
// web's contract file as it is (lib/contract/index.ts, docs/APP-CONTRACT.md §6.2), which lives one
// folder up, outside this project. The repo is not a workspace (ADR in docs/MOBILE-APP.md), so:
//   - watch that one folder (not the whole web app);
//   - map `@frequency/contract` to the file;
//   - resolve `zod` from THIS project's node_modules even when the contract imports it, so a build
//     that never installed the web's dependencies (EAS, CI) still bundles, with one copy of zod.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const contractDir = path.resolve(projectRoot, '../lib/contract')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [...(config.watchFolders ?? []), contractDir]

const upstream = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest
  if (moduleName === '@frequency/contract') {
    return { type: 'sourceFile', filePath: path.join(contractDir, 'index.ts') }
  }
  if (moduleName === 'usb-serial') {
    return { type: 'sourceFile', filePath: path.join(projectRoot, 'modules/usb-serial/src/index.ts') }
  }
  if ((moduleName === 'zod' || moduleName.startsWith('zod/')) && context.originModulePath.startsWith(contractDir)) {
    return resolve({ ...context, originModulePath: path.join(projectRoot, 'package.json') }, moduleName, platform)
  }
  return resolve(context, moduleName, platform)
}

module.exports = config

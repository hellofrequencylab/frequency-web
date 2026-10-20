// Lint for Frequency Experience: Expo's flat config. Run `pnpm lint` from mobile/.
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'src/theme/icons.generated.ts'] },
])

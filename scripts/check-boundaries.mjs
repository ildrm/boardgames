import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['packages/game-engine/src', 'packages/games']
const forbidden = /from\s+["'](?:@nestjs\/|react(?:-dom)?\b|socket\.io\b|redis\b|pg\b|@tablemate\/api\b)/
let failures = 0

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && !['node_modules', 'dist'].includes(entry.name)) inspect(path)
    if (entry.isFile() && entry.name.endsWith('.ts') && forbidden.test(readFileSync(path, 'utf8'))) {
      console.error(`Forbidden infrastructure import in ${path}`)
      failures += 1
    }
  }
}

for (const root of roots) inspect(root)
if (failures > 0) process.exitCode = 1

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.SQLITE_DB_PATH || join(__dirname, '..', 'data', 'openchat.db')

async function main() {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()

  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  let db
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS embed_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      token TEXT NOT NULL UNIQUE,
      allowed_agent_ids TEXT NOT NULL DEFAULT '[]',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  const fileArg = process.argv.find(a => a.startsWith('--file='))
  const tokens = []

  if (fileArg) {
    const filePath = fileArg.replace('--file=', '')
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    tokens.push(...raw)
  } else {
    const now = Math.floor(Date.now() / 1000)
    tokens.push({
      id: randomUUID(),
      name: 'Default Embed Token',
      description: '默认嵌入 Token，允许访问全部智能体',
      token: 'sk-embed-default-' + randomUUID().slice(0, 8),
      allowed_agent_ids: ['*'],
      is_enabled: true,
      created_at: now,
      updated_at: now,
    })
  }

  for (const tok of tokens) {
    const existing = db.prepare('SELECT id FROM embed_tokens WHERE token = ?')
    existing.bind([tok.token])
    if (existing.step()) {
      console.log(`Token "${tok.name}" already exists, skipping.`)
      existing.free()
      continue
    }
    existing.free()

    db.run(
      `INSERT OR REPLACE INTO embed_tokens (id, name, description, token, allowed_agent_ids, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tok.id,
        tok.name,
        tok.description || '',
        tok.token,
        JSON.stringify(tok.allowed_agent_ids),
        tok.is_enabled !== false ? 1 : 0,
        tok.created_at,
        tok.updated_at,
      ]
    )
    console.log(`Inserted token: "${tok.name}" (${tok.token})`)
  }

  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
  db.close()
  console.log(`Done. Database saved to ${dbPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

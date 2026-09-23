// db/dbenv.js — the one place a database URL is resolved.
//
// Reads DATABASE_URL from the environment, falling back to the repo's .env (which is gitignored).
// Never hardcode a connection string in a script: it leaks the credential into git history, and the
// password then has to be rotated to be made worthless again.
//
//   const { url } = require('./dbenv')            // from db/
//   const { url } = require('./db/dbenv')         // from the repo root
//   const client = new Client({ connectionString: url(), ssl: { rejectUnauthorized: false } })

const fs = require('fs')
const path = require('path')

function fromEnvFile() {
  const candidates = [
    path.join(__dirname, '..', '.env'),   // repo root
    path.join(process.cwd(), '.env'),
  ]
  for (const file of candidates) {
    try {
      const m = fs.readFileSync(file, 'utf8').match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m)
      if (m && m[1]) return m[1].trim()
    } catch {
      // try the next candidate
    }
  }
  return null
}

function url() {
  const fromEnv = process.env.DATABASE_URL
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  const fromFile = fromEnvFile()
  if (fromFile) return fromFile
  throw new Error('DATABASE_URL is not set and no .env containing DATABASE_URL was found')
}

module.exports = { url }
module.exports.default = module.exports   // so ESM files can `import dbenv from './db/dbenv.js'`

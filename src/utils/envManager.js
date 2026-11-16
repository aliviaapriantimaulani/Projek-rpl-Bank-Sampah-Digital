const fs = require('fs');
const path = require('path');

// Absolute path to the .env file in the project root
const ENV_PATH = path.resolve(process.cwd(), '.env');

/**
 * Parse the .env file and return an object of key/value pairs.
 * Lines starting with '#' are ignored.
 */
function parseEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const raw = fs.readFileSync(ENV_PATH, { encoding: 'utf8' });
  const lines = raw.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

/**
 * Set or update a single environment variable in the .env file.
 * Also updates process.env for the current Node process so the change
 * takes effect immediately without restarting the server.
 * @param {string} key   Environment variable name
 * @param {string} value New value
 */
function setEnv(key, value) {
  if (!key) return;
  const env = parseEnv();
  env[key] = value;
  const newContent = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(ENV_PATH, newContent, { encoding: 'utf8' });
  // Apply to current process immediately
  process.env[key] = value;
}

module.exports = { parseEnv, setEnv };

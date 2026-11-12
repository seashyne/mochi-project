import fs from 'node:fs';
import path from 'node:path';

const MAX_LINES = 300;
// `vendor` holds verbatim upstream files that we are not allowed to reformat,
// so the 300-line SRP ceiling does not apply there. See docs/OPEN_SOURCE_POLICY.md.
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-player', 'dist-studio', '.wrangler', '.tmp', 'coverage', 'android', 'ios', 'godot-master', '.agents', '.workbuddy-ai', 'vendor']);
const IGNORED_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'godot-master.zip']);
const CHECK_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|css|html|sql|md|json)$/;

let totalChecked = 0;
let violationCount = 0;

function checkLineCount(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        checkLineCount(fullPath);
      }
    } else if (CHECK_EXTENSIONS.test(entry.name) && !IGNORED_FILES.has(entry.name)) {
      totalChecked++;
      const fileContent = fs.readFileSync(fullPath, 'utf8');
      const lines = fileContent.split('\n').length;

      if (lines > MAX_LINES) {
        console.error(`SRP line ceiling exceeded: ${fullPath} has ${lines} lines (maximum allowed is ${MAX_LINES})`);
        violationCount++;
      }
    }
  }
}

console.log(`Checking line counts across workspace (strict limit: ${MAX_LINES} lines per file)...`);
checkLineCount('.');

if (violationCount > 0) {
  console.error(`Line count check FAILED: ${violationCount} file(s) exceed the ${MAX_LINES}-line ceiling.`);
  process.exit(1);
} else {
  console.log(`Line count check PASSED: All ${totalChecked} checked files are strictly <= ${MAX_LINES} lines.`);
}

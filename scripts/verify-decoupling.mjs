import fs from 'node:fs';
import path from 'node:path';

// Forbidden patterns checking zero coupling or imports from Alenout / lenout-cloud
const FORBIDDEN_IMPORT_PATTERNS = [
  /@arlay/i,
  /from\s+['"][^'"]*lenout-cloud/i,
  /from\s+['"][^'"]*Alenout\s+Project/i,
  /from\s+['"]\.\.\/\.\.\/\.\.\//,
  /require\(['"][^'"]*lenout-cloud/i,
  /require\(['"][^'"]*Alenout\s+Project/i,
  /lencon/i
];

const SCAN_ROOTS = ['mochi', 'mochi-cloud'];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.wrangler', '.tmp', 'coverage', 'android', 'ios']);

let violationCount = 0;
let fileCount = 0;

function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isSymbolicLink()) {
      console.error(`Decoupling violation: Symlink detected at ${fullPath}`);
      violationCount++;
      continue;
    }

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        scanDirectory(fullPath);
      }
    } else if (/\.(ts|tsx|js|mjs|cjs|json|sql)$/.test(entry.name)) {
      fileCount++;
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(content)) {
          console.error(`Decoupling violation in ${fullPath}: matches forbidden pattern ${pattern}`);
          violationCount++;
        }
      }
    }
  }
}

console.log('Running Mochi Project decoupling and anti-leak verification...');
for (const target of SCAN_ROOTS) {
  scanDirectory(target);
}

if (violationCount > 0) {
  console.error(`Verification FAILED: ${violationCount} decoupling violation(s) found across ${fileCount} files.`);
  process.exit(1);
} else {
  console.log(`Verification PASSED: ${fileCount} files verified. Zero forbidden imports or symlinks detected.`);
}

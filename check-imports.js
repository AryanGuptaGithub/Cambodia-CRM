import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendPath = path.join(__dirname, 'backend');

function walkDir(dir, callback) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const dirPath = path.join(dir, f);
      const isDirectory = fs.statSync(dirPath).isDirectory();
      isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    }
  } catch (err) {
    console.error(`Error walking directory ${dir}:`, err.message);
  }
}

function checkImports(filePath) {
  if (!filePath.endsWith('.js')) return;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Remove single-line comments
    const codeWithoutComments = content.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments
    const codeOnly = codeWithoutComments.replace(/\/\*[\s\S]*?\*\//g, '');

    const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
    let match;

    while ((match = importRegex.exec(codeOnly)) !== null) {
      const importPath = match[1];

      if (importPath.startsWith('.')) {
        const resolvedPath = path.resolve(path.dirname(filePath), importPath);
        const fullPath = resolvedPath.endsWith('.js') ? resolvedPath : resolvedPath + '.js';

        if (!fs.existsSync(fullPath)) {
          console.log(`❌ MISSING: ${filePath} imports "${importPath}" (resolved to ${fullPath})`);
        }
      }
    }
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err.message);
  }
}

console.log('🔍 Checking imports in backend...\n');
walkDir(backendPath, (filePath) => {
  checkImports(filePath);
});

console.log('\n✅ Import check complete!');

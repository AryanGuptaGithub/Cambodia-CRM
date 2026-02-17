// scripts/log-viewer.js
// ─────────────────────────────────────────────────────────────────────────────
// CLI tool to browse, search, and restore logs stored under:
//   logs/
//   └── YYYY-MM-DD/
//       ├── application-YYYY-MM-DD.log
//       ├── error-YYYY-MM-DD.log
//       ├── debug-YYYY-MM-DD.log
//       ├── user-activity-YYYY-MM-DD.log
//       └── backups/
//           └── HH-00/
//               ├── user-activity-YYYY-MM-DD.log  (snapshot)
//               └── manifest.json
//
// Usage:
//   node scripts/log-viewer.js --recent [count] [level]
//   node scripts/log-viewer.js --activity [count] [user]
//   node scripts/log-viewer.js --search <term> [level]
//   node scripts/log-viewer.js --stats
//   node scripts/log-viewer.js --user <email>
//   node scripts/log-viewer.js --module <moduleName>
//   node scripts/log-viewer.js --date <YYYY-MM-DD>
//   node scripts/log-viewer.js --backups
//   node scripts/log-viewer.js --restore <YYYY-MM-DD> <HH-00>
//   node scripts/log-viewer.js --errors [count]
// ─────────────────────────────────────────────────────────────────────────────

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR  = path.join(__dirname, '../logs');

// ─── ANSI colours ────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  grey:   '\x1b[90m',
};

const colour = {
  error:   (s) => `${C.red}${s}${C.reset}`,
  warn:    (s) => `${C.yellow}${s}${C.reset}`,
  info:    (s) => `${C.cyan}${s}${C.reset}`,
  debug:   (s) => `${C.grey}${s}${C.reset}`,
  success: (s) => `${C.green}${s}${C.reset}`,
  label:   (s) => `${C.bold}${C.blue}${s}${C.reset}`,
  dim:     (s) => `${C.dim}${s}${C.reset}`,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Read & parse every line of every matching log file. */
const readLogs = ({
  dateDir    = null,   // restrict to a specific YYYY-MM-DD folder
  fileFilter = null,   // regexp tested against the filename
  limit      = Infinity,
} = {}) => {
  if (!fs.existsSync(LOGS_DIR)) {
    console.error(colour.error('logs/ directory not found. Start the server first.'));
    return [];
  }

  const entries = [];

  // Collect date directories (newest first)
  const dateDirs = fs.readdirSync(LOGS_DIR)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!dateDir || d === dateDir))
    .sort()
    .reverse();

  for (const dd of dateDirs) {
    const dirPath = path.join(LOGS_DIR, dd);
    const files   = fs.readdirSync(dirPath)
      .filter((f) => f.endsWith('.log') && (!fileFilter || fileFilter.test(f)));

    for (const file of files) {
      const lines = fs.readFileSync(path.join(dirPath, file), 'utf8')
        .split('\n')
        .filter((l) => l.trim());

      for (const line of lines) {
        try {
          entries.push({ _file: file, _date: dd, ...JSON.parse(line) });
        } catch {
          // Try to parse the human-readable format:  2025-02-17 14:32:01 [INFO] msg {...}
          const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (.*)$/);
          if (m) {
            entries.push({ _file: file, _date: dd, timestamp: m[1], level: m[2].toLowerCase(), message: m[3], _raw: true });
          }
        }
      }
    }

    if (entries.length >= limit) break;
  }

  return entries
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

/** Format a single log entry for terminal display. */
const formatEntry = (e, verbose = false) => {
  const lvl = (e.level || 'info').toLowerCase();
  const lvlLabel = {
    error: colour.error('[ERROR]'),
    warn:  colour.warn('[WARN ]'),
    info:  colour.info('[INFO ]'),
    debug: colour.debug('[DEBUG]'),
  }[lvl] || `[${lvl.toUpperCase()}]`;

  const ts   = colour.dim(e.timestamp || '');
  const user = e.user   ? colour.success(`👤 ${e.user}`) : '';
  const mod  = e.module ? colour.label(`[${e.module}]`)  : '';
  const act  = e.action ? `${C.yellow}${e.action}${C.reset}` : '';
  const tgt  = e.target ? colour.dim(`→ ${e.target}`)    : '';
  const stat = e.status === 'failure' ? colour.error('✗ FAILED') : '';

  const msg  = e.message || '';

  let line = `${ts} ${lvlLabel} ${user} ${mod} ${act} ${msg} ${tgt} ${stat}`.replace(/\s{2,}/g, ' ').trim();

  if (verbose && e.details && Object.keys(e.details).length) {
    line += '\n' + colour.dim('  Details: ' + JSON.stringify(e.details, null, 2).split('\n').join('\n  '));
  }

  return line;
};

/** Human-readable file size */
const fmtSize = (bytes) => {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

// ─── COMMANDS ────────────────────────────────────────────────────────────────

const commands = {

  /** Show the most recent N log entries (all files). */
  recent ({ count = 50, level = 'all', verbose = false } = {}) {
    const logs = readLogs({ limit: count * 10 })
      .filter((e) => level === 'all' || (e.level || '').toLowerCase() === level.toLowerCase())
      .slice(0, count);

    console.log(colour.label(`\n──── Recent logs (${logs.length} entries, level: ${level}) ────\n`));
    logs.forEach((e) => console.log(formatEntry(e, verbose)));
    console.log('');
  },

  /** Show user-activity log entries only. */
  activity ({ count = 100, user = null, verbose = false } = {}) {
    const logs = readLogs({ fileFilter: /user-activity/ })
      .filter((e) => !user || (e.user || '').toLowerCase().includes(user.toLowerCase()))
      .slice(0, count);

    console.log(colour.label(`\n──── User Activity (${logs.length} entries${user ? `, user: ${user}` : ''}) ────\n`));
    logs.forEach((e) => console.log(formatEntry(e, verbose)));
    console.log('');
  },

  /** Filter activity by a specific user email. */
  user ({ email, count = 200, verbose = false } = {}) {
    if (!email) { console.error(colour.error('Provide --user <email>')); return; }

    const logs = readLogs({ fileFilter: /user-activity/ })
      .filter((e) => (e.user || '').toLowerCase().includes(email.toLowerCase()))
      .slice(0, count);

    console.log(colour.label(`\n──── Activity for "${email}" (${logs.length} entries) ────\n`));
    logs.forEach((e) => console.log(formatEntry(e, verbose)));
    console.log('');
  },

  /** Filter activity by module name. */
  module ({ name, count = 200, verbose = false } = {}) {
    if (!name) { console.error(colour.error('Provide --module <name>')); return; }

    const logs = readLogs({ fileFilter: /user-activity/ })
      .filter((e) => (e.module || '').toLowerCase() === name.toLowerCase())
      .slice(0, count);

    console.log(colour.label(`\n──── Module "${name}" Activity (${logs.length} entries) ────\n`));
    logs.forEach((e) => console.log(formatEntry(e, verbose)));
    console.log('');
  },

  /** Show logs for a specific date. */
  date ({ dateStr, level = 'all', count = 200, verbose = false } = {}) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      console.error(colour.error('Provide --date YYYY-MM-DD'));
      return;
    }

    const logs = readLogs({ dateDir: dateStr })
      .filter((e) => level === 'all' || (e.level || '').toLowerCase() === level.toLowerCase())
      .slice(0, count);

    console.log(colour.label(`\n──── Logs for ${dateStr} (${logs.length} entries) ────\n`));
    logs.forEach((e) => console.log(formatEntry(e, verbose)));
    console.log('');
  },

  /** Full-text search across all log files. */
  search ({ term, level = 'all', count = 100, verbose = false } = {}) {
    if (!term) { console.error(colour.error('Provide --search <term>')); return; }
    const lower = term.toLowerCase();

    const logs = readLogs()
      .filter((e) => {
        const haystack = JSON.stringify(e).toLowerCase();
        return haystack.includes(lower) &&
          (level === 'all' || (e.level || '').toLowerCase() === level.toLowerCase());
      })
      .slice(0, count);

    console.log(colour.label(`\n──── Search: "${term}" (${logs.length} matches) ────\n`));
    logs.forEach((e) => console.log(formatEntry(e, verbose)));
    console.log('');
  },

  /** Show only error-level entries. */
  errors ({ count = 50, verbose = false } = {}) {
    const logs = readLogs({ fileFilter: /error/ })
      .filter((e) => (e.level || '').toLowerCase() === 'error')
      .slice(0, count);

    console.log(colour.label(`\n──── Errors (${logs.length} entries) ────\n`));
    logs.forEach((e) => console.log(formatEntry(e, verbose)));
    console.log('');
  },

  /** Overall statistics. */
  stats () {
    if (!fs.existsSync(LOGS_DIR)) {
      console.error(colour.error('logs/ directory not found.'));
      return;
    }

    let totalSize = 0;
    let totalFiles = 0;
    const byDate   = {};
    const byLevel  = { error: 0, warn: 0, info: 0, debug: 0 };
    const byModule = {};
    const byUser   = {};
    const byAction = {};

    const dateDirs = fs.readdirSync(LOGS_DIR)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .reverse();

    for (const dd of dateDirs) {
      const dirPath = path.join(LOGS_DIR, dd);
      byDate[dd] = { files: 0, size: 0, errors: 0, entries: 0 };

      fs.readdirSync(dirPath)
        .filter((f) => f.endsWith('.log') && fs.statSync(path.join(dirPath, f)).isFile())
        .forEach((file) => {
          const fStat = fs.statSync(path.join(dirPath, file));
          totalFiles++;
          totalSize += fStat.size;
          byDate[dd].files++;
          byDate[dd].size += fStat.size;

          // Parse entries for deeper stats
          fs.readFileSync(path.join(dirPath, file), 'utf8')
            .split('\n')
            .filter((l) => l.trim())
            .forEach((line) => {
              try {
                const e = JSON.parse(line);
                byDate[dd].entries++;
                const lvl = (e.level || 'info').toLowerCase();
                if (lvl in byLevel) byLevel[lvl]++;
                if (lvl === 'error') byDate[dd].errors++;

                if (e.module) byModule[e.module] = (byModule[e.module] || 0) + 1;
                if (e.user)   byUser[e.user]     = (byUser[e.user]     || 0) + 1;
                if (e.action) byAction[e.action]  = (byAction[e.action]  || 0) + 1;
              } catch { /* raw line */ }
            });
        });
    }

    console.log(colour.label('\n══════════════════════════════════════════'));
    console.log(colour.label('           LOG STATISTICS REPORT'));
    console.log(colour.label('══════════════════════════════════════════\n'));

    console.log(colour.label('📁 Overview'));
    console.log(`   Total log files : ${colour.info(totalFiles)}`);
    console.log(`   Total disk size : ${colour.info(fmtSize(totalSize))}`);
    console.log(`   Date directories: ${colour.info(dateDirs.length)}\n`);

    console.log(colour.label('📊 By Level'));
    Object.entries(byLevel).forEach(([lvl, cnt]) => {
      const bar = '█'.repeat(Math.min(50, Math.round(cnt / 10)));
      const lbl = lvl === 'error' ? colour.error(lvl.padEnd(6))
        : lvl === 'warn' ? colour.warn(lvl.padEnd(6))
        : colour.info(lvl.padEnd(6));
      console.log(`   ${lbl} ${cnt.toString().padStart(7)}  ${colour.dim(bar)}`);
    });

    if (Object.keys(byModule).length) {
      console.log('');
      console.log(colour.label('🔧 By Module (top 10)'));
      Object.entries(byModule)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([mod, cnt]) =>
          console.log(`   ${mod.padEnd(20)} ${colour.info(cnt)}`)
        );
    }

    if (Object.keys(byUser).length) {
      console.log('');
      console.log(colour.label('👤 Top Users (top 10)'));
      Object.entries(byUser)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([u, cnt]) =>
          console.log(`   ${u.padEnd(30)} ${colour.success(cnt)} actions`)
        );
    }

    if (Object.keys(byAction).length) {
      console.log('');
      console.log(colour.label('⚡ By Action'));
      Object.entries(byAction)
        .sort((a, b) => b[1] - a[1])
        .forEach(([a, cnt]) =>
          console.log(`   ${a.padEnd(20)} ${colour.info(cnt)}`)
        );
    }

    console.log('');
    console.log(colour.label('📅 By Date (last 7 days)'));
    Object.entries(byDate)
      .slice(0, 7)
      .forEach(([d, s]) =>
        console.log(
          `   ${d}  files: ${s.files}  entries: ${colour.info(s.entries)}  errors: ${s.errors > 0 ? colour.error(s.errors) : s.errors}  size: ${fmtSize(s.size)}`
        )
      );

    console.log('');
  },

  /** List all available hourly backups. */
  backups () {
    if (!fs.existsSync(LOGS_DIR)) { console.error(colour.error('logs/ not found.')); return; }

    console.log(colour.label('\n──── Available Hourly Backups ────\n'));

    let found = false;
    const dateDirs = fs.readdirSync(LOGS_DIR)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .reverse();

    for (const dd of dateDirs) {
      const backupsRoot = path.join(LOGS_DIR, dd, 'backups');
      if (!fs.existsSync(backupsRoot)) continue;

      const hourDirs = fs.readdirSync(backupsRoot).sort().reverse();
      hourDirs.forEach((hd) => {
        found = true;
        const fullPath = path.join(backupsRoot, hd);
        const files    = fs.readdirSync(fullPath).filter((f) => f.endsWith('.log'));
        const manifest = (() => {
          try { return JSON.parse(fs.readFileSync(path.join(fullPath, 'manifest.json'), 'utf8')); }
          catch { return null; }
        })();

        console.log(
          `   ${colour.info(`${dd} ${hd.replace('-00', ':00')}`)}` +
          `  ${colour.dim(`${files.length} files`)}` +
          (manifest ? colour.dim(`  backed up at ${manifest.backupTime}`) : '')
        );
        console.log(colour.dim(`     → Restore: node scripts/log-viewer.js --restore ${dd} ${hd}`));
      });
    }

    if (!found) console.log(colour.dim('   No backups found yet. They are created hourly.\n'));
    console.log('');
  },

  /** Restore a specific hourly backup. */
  restore ({ date, hour } = {}) {
    if (!date || !hour) {
      console.error(colour.error('Usage: --restore YYYY-MM-DD HH-00'));
      return;
    }

    const backupDir = path.join(LOGS_DIR, date, 'backups', hour);
    if (!fs.existsSync(backupDir)) {
      console.error(colour.error(`Backup not found: logs/${date}/backups/${hour}`));
      return;
    }

    const targetDir = path.join(LOGS_DIR, date);
    const files     = fs.readdirSync(backupDir).filter((f) => f.endsWith('.log'));

    if (files.length === 0) {
      console.warn(colour.warn('No .log files in this backup.'));
      return;
    }

    console.log(colour.warn(`\n⚠️  This will overwrite ${files.length} log files in logs/${date}/`));
    console.log(colour.warn('   Press Ctrl+C within 5 seconds to cancel...\n'));

    let cancelled = false;
    process.on('SIGINT', () => { cancelled = true; console.log(colour.error('\nRestore cancelled.')); process.exit(0); });

    setTimeout(() => {
      if (cancelled) return;

      files.forEach((file) => {
        fs.copyFileSync(path.join(backupDir, file), path.join(targetDir, file));
        console.log(colour.success(`   ✓ Restored ${file}`));
      });

      console.log(colour.success(`\n✅ Restore complete: ${files.length} files from ${date}/${hour}\n`));
    }, 5000);
  },

  /** Print help. */
  help () {
    console.log(`
${colour.label('LOG VIEWER – Usage')}

${colour.info('node scripts/log-viewer.js <command> [options]')}

${colour.label('Commands:')}
  ${colour.success('--recent')}   [count=50] [level=all]     Show recent log entries
  ${colour.success('--activity')} [count=100] [user=*]       Show user-activity events
  ${colour.success('--user')}     <email> [count=200]        Show all actions by a user
  ${colour.success('--module')}   <name> [count=200]         Filter by module (Sales, Auth, …)
  ${colour.success('--date')}     <YYYY-MM-DD> [level=all]   Show logs for a specific date
  ${colour.success('--search')}   <term> [level=all]         Full-text search across all logs
  ${colour.success('--errors')}   [count=50]                 Show only error entries
  ${colour.success('--stats')}                               Print summary statistics
  ${colour.success('--backups')}                             List available hourly backups
  ${colour.success('--restore')} <YYYY-MM-DD> <HH-00>       Restore from a backup snapshot
  ${colour.success('--help')}                                Show this message

${colour.label('Examples:')}
  node scripts/log-viewer.js --recent 100 error
  node scripts/log-viewer.js --user admin@example.com
  node scripts/log-viewer.js --module Sales
  node scripts/log-viewer.js --date 2025-02-17
  node scripts/log-viewer.js --search "invoice INV-042"
  node scripts/log-viewer.js --backups
  node scripts/log-viewer.js --restore 2025-02-17 14-00
`);
  },
};

// ─── CLI PARSER ──────────────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;
const verbose = rest.includes('--verbose') || rest.includes('-v');
const args    = rest.filter((a) => a !== '--verbose' && a !== '-v');

switch (cmd) {
  case '--recent':   commands.recent  ({ count: +args[0] || 50, level: args[1] || 'all', verbose }); break;
  case '--activity': commands.activity({ count: +args[0] || 100, user: args[1] || null, verbose });   break;
  case '--user':     commands.user    ({ email: args[0], count: +args[1] || 200, verbose });          break;
  case '--module':   commands.module  ({ name: args[0], count: +args[1] || 200, verbose });           break;
  case '--date':     commands.date    ({ dateStr: args[0], level: args[1] || 'all', count: 200, verbose }); break;
  case '--search':   commands.search  ({ term: args[0], level: args[1] || 'all', verbose });          break;
  case '--errors':   commands.errors  ({ count: +args[0] || 50, verbose });                           break;
  case '--stats':    commands.stats   ();                                                              break;
  case '--backups':  commands.backups ();                                                              break;
  case '--restore':  commands.restore ({ date: args[0], hour: args[1] });                             break;
  case '--help':
  default:           commands.help    ();                                                              break;
}

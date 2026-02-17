// logger.js
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// ─────────────────────────────────────────────
// 1. DIRECTORY HELPERS
// ─────────────────────────────────────────────

const BASE_LOGS_DIR = path.join(process.cwd(), 'logs');

/** Returns today's log folder: logs/YYYY-MM-DD/ */
const getTodayDir = () => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dir = path.join(BASE_LOGS_DIR, today);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** Returns the 1-hour backup folder: logs/YYYY-MM-DD/backups/HH-00/ */
const getBackupDir = () => {
  const now = new Date();
  const dateStr  = now.toISOString().slice(0, 10);
  const hourStr  = String(now.getHours()).padStart(2, '0');
  const dir = path.join(BASE_LOGS_DIR, dateStr, 'backups', `${hourStr}-00`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// Ensure base directory exists on startup
if (!fs.existsSync(BASE_LOGS_DIR)) fs.mkdirSync(BASE_LOGS_DIR, { recursive: true });
getTodayDir(); // create today's folder immediately


// ─────────────────────────────────────────────
// 2. LOG FORMAT
// ─────────────────────────────────────────────

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? JSON.stringify(meta, null, 2)
      : '';
    return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);


// ─────────────────────────────────────────────
// 3. TRANSPORT FACTORY
//    All files go into logs/YYYY-MM-DD/
// ─────────────────────────────────────────────

/** Resolves the current day's directory at the moment Winston opens the file */
const dayPath = (filename) => path.join(getTodayDir(), filename);

const makeTransports = () => [
  // Console (colourised)
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), logFormat),
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),

  // All logs  →  logs/YYYY-MM-DD/application-YYYY-MM-DD.log
  new DailyRotateFile({
    filename: path.join(BASE_LOGS_DIR, '%DATE%', 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat,
    level: 'info',
  }),

  // Errors only  →  logs/YYYY-MM-DD/error-YYYY-MM-DD.log
  new DailyRotateFile({
    filename: path.join(BASE_LOGS_DIR, '%DATE%', 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat,
    level: 'error',
  }),

  // Debug  →  logs/YYYY-MM-DD/debug-YYYY-MM-DD.log
  new DailyRotateFile({
    filename: path.join(BASE_LOGS_DIR, '%DATE%', 'debug-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '7d',
    format: logFormat,
    level: 'debug',
  }),

  // User activity (JSON)  →  logs/YYYY-MM-DD/user-activity-YYYY-MM-DD.log
  new DailyRotateFile({
    filename: path.join(BASE_LOGS_DIR, '%DATE%', 'user-activity-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '50m',
    maxFiles: '90d',
    format: jsonFormat,
    level: 'info',
  }),
];


// ─────────────────────────────────────────────
// 4. MODULE LOGGERS
// ─────────────────────────────────────────────

const sharedTransports = makeTransports();

export const apiLogger    = winston.createLogger({ level: 'info',  format: logFormat, defaultMeta: { service: 'api'      }, transports: sharedTransports });
export const salesLogger  = winston.createLogger({ level: 'info',  format: logFormat, defaultMeta: { service: 'sales'    }, transports: sharedTransports });
export const stockLogger  = winston.createLogger({ level: 'info',  format: logFormat, defaultMeta: { service: 'stock'    }, transports: sharedTransports });
export const importLogger = winston.createLogger({ level: 'info',  format: logFormat, defaultMeta: { service: 'import'   }, transports: sharedTransports });
export const authLogger   = winston.createLogger({ level: 'info',  format: logFormat, defaultMeta: { service: 'auth'     }, transports: sharedTransports });
export const purchaseLogger = winston.createLogger({ level: 'info', format: logFormat, defaultMeta: { service: 'purchase' }, transports: sharedTransports });

export const debugLogger  = winston.createLogger({
  level: 'debug',
  format: logFormat,
  defaultMeta: { service: 'debug' },
  transports: [
    new DailyRotateFile({
      filename: path.join(BASE_LOGS_DIR, '%DATE%', 'stock-calculations-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '14d',
      format: logFormat,
    }),
  ],
});

export const dbLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'database' },
  transports: [
    new DailyRotateFile({
      filename: path.join(BASE_LOGS_DIR, '%DATE%', 'database-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat,
    }),
  ],
});

// ─────────────────────────────────────────────
// 5. USER ACTIVITY LOGGER
//    Writes structured JSON entries so every
//    action by every user is fully traceable.
// ─────────────────────────────────────────────

/**
 * Dedicated user-activity logger.
 * Output: logs/YYYY-MM-DD/user-activity-YYYY-MM-DD.log
 *
 * Each line is a JSON object:
 * {
 *   "timestamp": "2025-02-17 14:32:01",
 *   "level": "info",
 *   "service": "user-activity",
 *   "user": "admin@example.com",
 *   "role": "admin",
 *   "module": "Sales",
 *   "action": "DELETE",
 *   "target": "Invoice INV-0042",
 *   "targetId": "698c6860766517841499d997",
 *   "ip": "192.168.1.1",
 *   "userAgent": "Mozilla/5.0 ...",
 *   "status": "success",
 *   "details": { ... }
 * }
 */
export const userActivityLogger = winston.createLogger({
  level: 'info',
  format: jsonFormat,
  defaultMeta: { service: 'user-activity' },
  transports: [
    new DailyRotateFile({
      filename: path.join(BASE_LOGS_DIR, '%DATE%', 'user-activity-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '90d',
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, user, module: mod, action, target, status }) =>
          `${timestamp} [${level.toUpperCase()}] 👤 ${user || 'anonymous'} | ${mod || '-'} | ${action || '-'} | ${target || '-'} | ${status || '-'}`
        )
      ),
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    }),
  ],
});

/**
 * Log a user action.
 * @param {object} opts
 * @param {string} opts.user       - e.g. "admin@example.com"
 * @param {string} opts.role       - e.g. "admin" | "manager"
 * @param {string} opts.module     - e.g. "Sales" | "Purchase" | "Stock"
 * @param {string} opts.action     - e.g. "CREATE" | "UPDATE" | "DELETE" | "IMPORT" | "LOGIN"
 * @param {string} [opts.target]   - Human-readable description, e.g. "Invoice INV-0042"
 * @param {string} [opts.targetId] - DB _id of the affected document
 * @param {string} [opts.ip]
 * @param {string} [opts.userAgent]
 * @param {'success'|'failure'|'warning'} [opts.status='success']
 * @param {object} [opts.details]  - Any extra payload
 */
export const logUserActivity = ({
  user,
  role,
  module,
  action,
  target,
  targetId,
  ip,
  userAgent,
  status = 'success',
  details = {},
}) => {
  userActivityLogger.info(action, {
    user:      user      || 'anonymous',
    role:      role      || 'unknown',
    module:    module    || 'unknown',
    action,
    target:    target    || null,
    targetId:  targetId  || null,
    ip:        ip        || null,
    userAgent: userAgent || null,
    status,
    details,
  });
};


// ─────────────────────────────────────────────
// 6. EXPRESS MIDDLEWARE
// ─────────────────────────────────────────────

/** Logs every HTTP request with duration + status */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    apiLogger.info(`${req.method} ${req.originalUrl}`, {
      status:    res.statusCode,
      duration:  `${duration}ms`,
      ip:        req.ip,
      userAgent: req.get('user-agent'),
      user:      req.user?.email || 'anonymous',
    });
  });
  next();
};

/** Logs every HTTP request AND records it as a user-activity event */
export const userActivityMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const method   = req.method;
    const url      = req.originalUrl;
    const user     = req.user?.email || req.body?.email || 'anonymous';
    const role     = req.user?.role  || 'unknown';
    const status   = res.statusCode < 400 ? 'success' : 'failure';

    // Map method + URL to a module + action
    const { module, action, target } = resolveModuleAction(method, url, req.body, req.params);

    // Only log meaningful actions (skip static assets, health checks, etc.)
    if (module) {
      logUserActivity({
        user,
        role,
        module,
        action,
        target,
        targetId: req.params?.id || req.body?.id || null,
        ip:       req.ip,
        userAgent: req.get('user-agent'),
        status,
        details: {
          url,
          method,
          statusCode: res.statusCode,
          duration:   `${duration}ms`,
          body:       sanitiseBody(req.body),
        },
      });
    }
  });

  next();
};

/** Unhandled-error logger middleware */
export const errorLogger = (err, req, res, next) => {
  apiLogger.error('Unhandled error', {
    error:  err.message,
    stack:  err.stack,
    url:    req.originalUrl,
    method: req.method,
    user:   req.user?.email || 'anonymous',
    body:   sanitiseBody(req.body),
  });
  next(err);
};


// ─────────────────────────────────────────────
// 7. ROUTE → MODULE/ACTION RESOLVER
// ─────────────────────────────────────────────

const HTTP_TO_ACTION = {
  GET:    'VIEW',
  POST:   'CREATE',
  PUT:    'UPDATE',
  PATCH:  'UPDATE',
  DELETE: 'DELETE',
};

/**
 * Derives a human-readable { module, action, target } from an HTTP call.
 * Extend the `ROUTE_MAP` to cover your own routes.
 */
const resolveModuleAction = (method, url, body = {}, params = {}) => {
  const path_ = url.split('?')[0].toLowerCase();
  const action = HTTP_TO_ACTION[method] || method;

  // Route map: key = regex pattern, value = { module, label }
  const ROUTE_MAP = [
    { pattern: /\/api\/auth\/login/,              module: 'Auth',      label: 'LOGIN'          },
    { pattern: /\/api\/auth\/logout/,             module: 'Auth',      label: 'LOGOUT'         },
    { pattern: /\/api\/auth\/register/,           module: 'Auth',      label: 'REGISTER'       },
    { pattern: /\/api\/auth\/change-password/,    module: 'Auth',      label: 'CHANGE_PASSWORD'},

    { pattern: /\/api\/sales\/import/,            module: 'Sales',     label: 'IMPORT'         },
    { pattern: /\/api\/sales\/batch-delete/,      module: 'Sales',     label: 'BATCH_DELETE'   },
    { pattern: /\/api\/sales\/validate-mr/,       module: 'Sales',     label: 'VALIDATE_MR'    },
    { pattern: /\/api\/sales\/check-stock/,       module: 'Stock',     label: 'CHECK_STOCK'    },
    { pattern: /\/api\/sales\/[^/]+$/,            module: 'Sales',     label: action           },
    { pattern: /\/api\/sales/,                    module: 'Sales',     label: action           },

    { pattern: /\/api\/purchase\/[^/]+$/,         module: 'Purchase',  label: action           },
    { pattern: /\/api\/purchase/,                 module: 'Purchase',  label: action           },

    { pattern: /\/api\/products\/[^/]+$/,         module: 'Products',  label: action           },
    { pattern: /\/api\/products/,                 module: 'Products',  label: action           },

    { pattern: /\/api\/stock\/[^/]+$/,            module: 'Stock',     label: action           },
    { pattern: /\/api\/stock/,                    module: 'Stock',     label: action           },

    { pattern: /\/api\/staff\/[^/]+$/,            module: 'Staff',     label: action           },
    { pattern: /\/api\/staff/,                    module: 'Staff',     label: action           },

    { pattern: /\/api\/customers\/[^/]+$/,        module: 'Customers', label: action           },
    { pattern: /\/api\/customers/,                module: 'Customers', label: action           },

    { pattern: /\/api\/reports/,                  module: 'Reports',   label: 'GENERATE'       },
    { pattern: /\/api\/settings/,                 module: 'Settings',  label: action           },
  ];

  for (const route of ROUTE_MAP) {
    if (route.pattern.test(path_)) {
      const invoiceNo = body?.invoiceNumber || params?.invoiceNumber || null;
      const target = invoiceNo
        ? `${route.module} – ${invoiceNo}`
        : `${route.module}${params?.id ? ` – ID: ${params.id}` : ''}`;

      return { module: route.module, action: route.label, target };
    }
  }

  return { module: null, action: null, target: null }; // non-API / ignored routes
};

/** Remove sensitive fields before logging request bodies */
const sanitiseBody = (body = {}) => {
  if (!body || typeof body !== 'object') return body;
  const SENSITIVE = ['password', 'token', 'secret', 'creditCard', 'cvv'];
  const clean = { ...body };
  SENSITIVE.forEach((k) => { if (k in clean) clean[k] = '***'; });
  return clean;
};


// ─────────────────────────────────────────────
// 8. MANUAL ACTIVITY HELPERS  (call these in route handlers)
// ─────────────────────────────────────────────

/**
 * Extract user info from an Express `req` object.
 * Usage:  const who = userFromReq(req);
 *         logUserActivity({ ...who, module: 'Sales', action: 'DELETE', ... });
 */
export const userFromReq = (req) => ({
  user:      req.user?.email || req.body?.email || 'anonymous',
  role:      req.user?.role  || 'unknown',
  ip:        req.ip,
  userAgent: req.get('user-agent'),
});

/**
 * Quick helpers for common CRUD actions.
 * Usage (inside a route handler, AFTER the DB operation):
 *
 *   activity.created(req, 'Sales', `Invoice ${inv.invoiceNumber}`, inv._id);
 *   activity.deleted(req, 'Sales', `Invoice ${inv.invoiceNumber}`, inv._id);
 */
export const activity = {
  created: (req, module, target, targetId, details) =>
    logUserActivity({ ...userFromReq(req), module, action: 'CREATE', target, targetId, status: 'success', details }),

  updated: (req, module, target, targetId, details) =>
    logUserActivity({ ...userFromReq(req), module, action: 'UPDATE', target, targetId, status: 'success', details }),

  deleted: (req, module, target, targetId, details) =>
    logUserActivity({ ...userFromReq(req), module, action: 'DELETE', target, targetId, status: 'success', details }),

  imported: (req, module, count, details) =>
    logUserActivity({ ...userFromReq(req), module, action: 'IMPORT', target: `${count} records`, status: 'success', details }),

  viewed: (req, module, target, targetId) =>
    logUserActivity({ ...userFromReq(req), module, action: 'VIEW', target, targetId, status: 'success' }),

  failed: (req, module, action, target, error) =>
    logUserActivity({ ...userFromReq(req), module, action, target, status: 'failure', details: { error } }),

  login: (req, user, role) =>
    logUserActivity({ user, role, ip: req.ip, userAgent: req.get('user-agent'), module: 'Auth', action: 'LOGIN', status: 'success' }),

  logout: (req, user) =>
    logUserActivity({ user, ip: req.ip, userAgent: req.get('user-agent'), module: 'Auth', action: 'LOGOUT', status: 'success' }),
};


// ─────────────────────────────────────────────
// 9. HOURLY BACKUP
//    Every hour: copy current log files into
//    logs/YYYY-MM-DD/backups/HH-00/
//    Keeps 24 hourly snapshots so any mistake
//    in the last hour can be inspected.
// ─────────────────────────────────────────────

const performHourlyBackup = () => {
  try {
    const todayDir = getTodayDir();
    const backupDir = getBackupDir();
    const timestamp = new Date().toISOString();

    // Copy all .log files in today's folder (not sub-folders)
    const files = fs.readdirSync(todayDir).filter(
      (f) => f.endsWith('.log') && fs.statSync(path.join(todayDir, f)).isFile()
    );

    if (files.length === 0) return;

    files.forEach((file) => {
      const src  = path.join(todayDir, file);
      const dest = path.join(backupDir, file);
      fs.copyFileSync(src, dest);
    });

    // Write a backup manifest
    const manifest = {
      backupTime: timestamp,
      files:      files.length,
      fileNames:  files,
      backupDir,
    };
    fs.writeFileSync(
      path.join(backupDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    apiLogger.info('Hourly backup completed', manifest);
  } catch (err) {
    apiLogger.error('Hourly backup failed', { error: err.message, stack: err.stack });
  }
};

/** Schedule backup at the top of every hour */
const scheduleHourlyBackup = () => {
  const now  = new Date();
  const msUntilNextHour =
    (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

  // Fire once at the next :00, then every 60 min
  setTimeout(() => {
    performHourlyBackup();
    setInterval(performHourlyBackup, 60 * 60 * 1000);
  }, msUntilNextHour);
};

scheduleHourlyBackup();


// ─────────────────────────────────────────────
// 10. BACKUP RESTORE UTILITY
// ─────────────────────────────────────────────

/**
 * List all available hourly backups.
 * @returns {Array<{date, hour, backupDir, files, manifest}>}
 */
export const listBackups = () => {
  const backups = [];
  if (!fs.existsSync(BASE_LOGS_DIR)) return backups;

  const dateDirs = fs.readdirSync(BASE_LOGS_DIR)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();

  for (const dateDir of dateDirs) {
    const backupsRoot = path.join(BASE_LOGS_DIR, dateDir, 'backups');
    if (!fs.existsSync(backupsRoot)) continue;

    const hourDirs = fs.readdirSync(backupsRoot).sort().reverse();
    for (const hourDir of hourDirs) {
      const fullPath = path.join(backupsRoot, hourDir);
      const manifestPath = path.join(fullPath, 'manifest.json');
      let manifest = null;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (_) { /* no manifest yet */ }

      backups.push({
        date:      dateDir,
        hour:      hourDir,
        backupDir: fullPath,
        files:     fs.readdirSync(fullPath).filter((f) => f.endsWith('.log')),
        manifest,
      });
    }
  }

  return backups;
};

/**
 * Restore a specific hourly backup by overwriting the current day's log files.
 * ⚠️  This overwrites live log files – use with caution.
 *
 * @param {string} date  - e.g. "2025-02-17"
 * @param {string} hour  - e.g. "14-00"
 * @returns {{ restored: number, files: string[] }}
 */
export const restoreBackup = (date, hour) => {
  const backupDir = path.join(BASE_LOGS_DIR, date, 'backups', hour);
  if (!fs.existsSync(backupDir)) {
    throw new Error(`Backup not found: ${backupDir}`);
  }

  const todayDir = path.join(BASE_LOGS_DIR, date);
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.log'));

  files.forEach((file) => {
    fs.copyFileSync(path.join(backupDir, file), path.join(todayDir, file));
  });

  apiLogger.warn('Backup restored', { date, hour, filesRestored: files.length, files });
  return { restored: files.length, files };
};


// ─────────────────────────────────────────────
// 11. LOG CLEANUP
// ─────────────────────────────────────────────

export const cleanupOldLogs = (daysToKeep = 30) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);

  if (!fs.existsSync(BASE_LOGS_DIR)) return;

  // Remove date directories older than `daysToKeep`
  fs.readdirSync(BASE_LOGS_DIR).forEach((entry) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) return;
    const entryDate = new Date(entry);
    if (entryDate < cutoff) {
      fs.rmSync(path.join(BASE_LOGS_DIR, entry), { recursive: true, force: true });
      apiLogger.info('Deleted old log directory', { directory: entry });
    }
  });
};

// Run cleanup daily at 02:00
const scheduleCleanup = () => {
  const now  = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(2, 0, 0, 0);
  const msUntil2AM = next - now;

  setTimeout(() => {
    cleanupOldLogs();
    setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);
  }, msUntil2AM);
};
scheduleCleanup();


// ─────────────────────────────────────────────
// 12. DEFAULT EXPORT
// ─────────────────────────────────────────────

export default {
  api:      apiLogger,
  sales:    salesLogger,
  stock:    stockLogger,
  import:   importLogger,
  auth:     authLogger,
  purchase: purchaseLogger,
  debug:    debugLogger,
  db:       dbLogger,
  userActivity: userActivityLogger,

  // Middleware
  requestLogger,
  userActivityMiddleware,
  errorLogger,

  // Helpers
  logUserActivity,
  userFromReq,
  activity,

  // Backup / restore
  listBackups,
  restoreBackup,
  cleanupOldLogs,
};

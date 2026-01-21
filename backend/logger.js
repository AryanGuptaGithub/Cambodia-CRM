// logger.js
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level.toUpperCase()}] ${message} ${
      Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
    }`;
  })
);

// Create different transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    ),
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
  
  // Daily rotate file for all logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat,
    level: 'info',
  }),
  
  // Daily rotate file for errors only
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat,
    level: 'error',
  }),
  
  // Daily rotate file for debug logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'debug-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '7d',
    format: logFormat,
    level: 'debug',
  }),
];

// Create separate loggers for different modules
export const apiLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'api' },
  transports,
});

export const salesLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'sales' },
  transports,
});

export const stockLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'stock' },
  transports,
});

export const importLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'import' },
  transports,
});

export const debugLogger = winston.createLogger({
  level: 'debug',
  format: logFormat,
  defaultMeta: { service: 'debug' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'stock-calculations-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '14d',
      format: logFormat,
    }),
  ],
});

// Request logger middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    apiLogger.info(`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });
  
  next();
};

// Error logger middleware
export const errorLogger = (err, req, res, next) => {
  apiLogger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
  });
  next(err);
};

// Helper function for database operations
export const dbLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'database' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'database-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: logFormat,
    }),
  ],
});

// Log file cleanup utility
export const cleanupOldLogs = (daysToKeep = 30) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  fs.readdir(logsDir, (err, files) => {
    if (err) {
      apiLogger.error('Error reading logs directory', { error: err.message });
      return;
    }
    
    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        
        if (stats.mtime < cutoffDate) {
          fs.unlink(filePath, err => {
            if (err) {
              apiLogger.error('Error deleting old log file', { file: file, error: err.message });
            } else {
              apiLogger.info('Deleted old log file', { file: file });
            }
          });
        }
      });
    });
  });
};

// Schedule log cleanup (run daily at 2 AM)
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

export default {
  api: apiLogger,
  sales: salesLogger,
  stock: stockLogger,
  import: importLogger,
  debug: debugLogger,
  db: dbLogger,
  requestLogger,
  errorLogger,
};
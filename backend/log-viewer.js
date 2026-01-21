// scripts/log-viewer.js
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../logs');

const logViewer = {
  showRecent: (count = 50, level = 'all') => {
    const logs = [];
    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .sort()
      .reverse()
      .slice(0, 5); // Last 5 log files
    
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        try {
          const log = JSON.parse(line);
          if (level === 'all' || log.level === level) {
            logs.push(log);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      });
    }
    
    return logs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, count);
  },

  search: (searchTerm, level = 'all') => {
    const results = [];
    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'));
    
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
          try {
            const log = JSON.parse(line);
            if (level === 'all' || log.level === level) {
              results.push({ file, ...log });
            }
          } catch (e) {
            // If not JSON, add raw line
            if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
              results.push({ file, raw: line });
            }
          }
        }
      });
    }
    
    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  getStats: () => {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      byLevel: {},
      byService: {},
      recentErrors: []
    };
    
    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'));
    
    stats.totalFiles = files.length;
    
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const fileStats = fs.statSync(filePath);
      stats.totalSize += fileStats.size;
      
      // Count by file type
      if (file.includes('error')) stats.byLevel.error = (stats.byLevel.error || 0) + 1;
      if (file.includes('debug')) stats.byLevel.debug = (stats.byLevel.debug || 0) + 1;
      if (file.includes('application')) stats.byLevel.info = (stats.byLevel.info || 0) + 1;
    }
    
    return stats;
  }
};

// Command line interface
if (process.argv[2] === '--recent') {
  const count = process.argv[3] || 20;
  const level = process.argv[4] || 'all';
  const logs = logViewer.showRecent(parseInt(count), level);
} else if (process.argv[2] === '--search') {
  const term = process.argv[3];
  const level = process.argv[4] || 'all';
  const results = logViewer.search(term, level);
} else if (process.argv[2] === '--stats') {
  const stats = logViewer.getStats();
}
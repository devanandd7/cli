const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const chokidar = require('chokidar');
const readline = require('readline');

// File System Operations
const fileTools = {
  // Read file content (async)
  async readFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Read file content (sync)
  readFileSync(filePath) {
    try {
      const content = fsSync.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Write to file (async)
  async writeFile(filePath, content) {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Write to file (sync)
  writeFileSync(filePath, content) {
    try {
      const dir = path.dirname(filePath);
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }
      fsSync.writeFileSync(filePath, content, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Check if file or directory exists (async)
  async exists(path) {
    try {
      await fs.access(path);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  },

  // Check if file or directory exists (sync)
  existsSync(path) {
    return { exists: fsSync.existsSync(path) };
  },

  // List directory contents (async)
  async readDir(dirPath) {
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      const result = files.map(dirent => ({
        name: dirent.name,
        type: dirent.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, dirent.name)
      }));
      return { success: true, files: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // List directory contents (sync)
  readDirSync(dirPath) {
    try {
      const files = fsSync.readdirSync(dirPath, { withFileTypes: true });
      const result = files.map(dirent => ({
        name: dirent.name,
        type: dirent.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, dirent.name)
      }));
      return { success: true, files: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get file stats (sync)
  statSync(filePath) {
    try {
      const stats = fsSync.statSync(filePath);
      return {
        success: true,
        stats: {
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Create directory (sync)
  mkdirSync(dirPath) {
    try {
      fsSync.mkdirSync(dirPath, { recursive: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Remove file or directory (sync)
  removeSync(path, options = { recursive: true }) {
    try {
      if (fsSync.existsSync(path)) {
        const stats = fsSync.statSync(path);
        if (stats.isDirectory()) {
          fsSync.rmdirSync(path, options);
        } else {
          fsSync.unlinkSync(path);
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Process Management
const processTools = {
  // Execute shell command (async)
  async exec(command) {
    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true, stdout, stderr });
        }
      });
    });
  },

  // Search for files in directory (sync)
  searchFilesSync(directory, pattern, options = {}) {
    try {
      const { recursive = true, type = null } = options;
      const results = [];
      
      const searchDir = (dir) => {
        const items = fsSync.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          
          try {
            // Check if item matches the pattern
            const matches = item.name.match(pattern) || 
                         (options.fullPath && fullPath.match(pattern));
            
            if (matches) {
              // Check type filter if specified
              const stat = fsSync.statSync(fullPath);
              const isMatch = !type || 
                (type === 'file' && stat.isFile()) || 
                (type === 'dir' && stat.isDirectory());
              
              if (isMatch) {
                results.push({
                  name: item.name,
                  path: fullPath,
                  type: stat.isDirectory() ? 'directory' : 'file',
                  size: stat.size,
                  modified: stat.mtime,
                  created: stat.birthtime
                });
              }
            }
            
            // Recurse into subdirectories if recursive is true
            if (recursive && item.isDirectory()) {
              searchDir(fullPath);
            }
          } catch (error) {
            // Skip files/directories we can't access
            continue;
          }
        }
      };
      
      searchDir(directory);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  // Search for files in directory (async)
  async searchFiles(directory, pattern, options = {}) {
    return new Promise((resolve) => {
      try {
        const results = this.searchFilesSync(directory, pattern, options);
        resolve(results);
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  },

  // Spawn a process with streaming output
  spawnProcess(command, args = [], options = {}) {
    return new Promise((resolve) => {
      const proc = spawn(command, args, { 
        ...options,
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        process.stdout.write(str);
      });

      proc.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        process.stderr.write(str);
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          code,
          stdout,
          stderr
        });
      });
    });
  }
};

// File System Watcher
const createFileWatcher = (path, options = {}) => {
  const watcher = chokidar.watch(path, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ...options
  });

  return {
    on: (event, callback) => watcher.on(event, callback),
    close: () => watcher.close()
  };
};

// CLI Utilities
const cliTools = {
  // Ask a question and wait for user input
  question(query) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  },

  // Print to stdout with newline
  log(...args) {
    console.log(...args);
    return { success: true };
  },

  // Print to stderr with newline
  error(...args) {
    console.error(...args);
    return { success: false };
  }
};

// Export all tools
module.exports = {
  ...fileTools,
  ...processTools,
  ...cliTools,
  createFileWatcher
};
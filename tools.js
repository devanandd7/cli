const { exec } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const chokidar = require('chokidar');
const terminalManager = require('./terminal-manager');

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
  /**
   * Execute a command in a new terminal window
   * @param {string} command - Command to execute
   * @param {Object} [options] - Execution options
   * @param {string} [options.title='Gemini CLI Task'] - Window title
   * @param {string} [options.cwd=process.cwd()] - Working directory
   * @param {boolean} [options.wait=true] - Wait for command to complete
   * @param {boolean} [options.keepOpen=true] - Keep terminal open after command completes
   * @returns {Promise<{success: boolean, outputPath: string, pid: number}>}
   */
  async executeInTerminal(command, options = {}) {
    try {
      console.log(chalk.blue(`\n🚀 Executing in new terminal: ${command}\n`));
      const result = await terminalManager.executeInNewTerminal(command, {
        title: 'Gemini CLI - ' + (options.title || 'Task'),
        cwd: options.cwd || process.cwd(),
        wait: options.wait !== false,
        keepOpen: options.keepOpen !== false
      });
      
      if (result.success) {
        console.log(chalk.green(`\n✅ Command completed successfully (PID: ${result.pid})`));
      } else {
        console.error(chalk.red(`\n❌ Command failed with code ${result.exitCode} (PID: ${result.pid})`));
        console.log(chalk.dim(`Logs: ${result.outputPath}`));
      }
      
      return result;
    } catch (error) {
      console.error(chalk.red(`\n❌ Failed to execute command: ${error.message}`));
      throw error;
    }
  },
  
  /**
   * List all active terminal processes
   * @returns {Array} List of active processes
   */
  listTerminalProcesses() {
    return terminalManager.listProcesses();
  },
  
  /**
   * Kill a terminal process
   * @param {number} pid - Process ID
   * @returns {boolean} True if process was killed, false otherwise
   */
  killTerminalProcess(pid) {
    return terminalManager.killProcess(pid);
  },
  
  /**
   * Get information about a terminal process
   * @param {number} pid - Process ID
   * @returns {Object|null} Process info or null if not found
   */
  getTerminalProcessInfo(pid) {
    return terminalManager.getProcessInfo(pid);
  },
  /**
   * Execute a shell command with real-time output
   * @param {string} command - The command to execute
   * @param {Object} [options] - Execution options
   * @param {string} [options.cwd=process.cwd()] - Working directory
   * @param {boolean} [options.verbose=true] - Show command output in real-time
   * @param {boolean} [options.throwOnError=true] - Throw an error if command fails
   * @returns {Promise<{success: boolean, code: number, stdout: string, stderr: string}>}
   */
  async executeCommand(command, options = {}) {
    const {
      cwd = process.cwd(),
      verbose = true,
      throwOnError = true,
      env = process.env
    } = options;

    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellArgs = isWindows ? ['/c', command] : ['-c', command];

      const child = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env, ...env },
        stdio: verbose ? 'pipe' : 'ignore',
        shell: false,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      if (verbose) {
        child.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          process.stdout.write(`[CMD] ${output}`);
        });

        child.stderr.on('data', (data) => {
          const error = data.toString();
          stderr += error;
          process.stderr.write(`[ERR] ${error}`);
        });
      } else {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('error', (error) => {
        if (verbose) {
          console.error(`[ERROR] Failed to start command: ${error.message}`);
        }
        resolve({
          success: false,
          code: -1,
          stdout,
          stderr: error.message,
          error
        });
      });

      child.on('close', (code) => {
        const success = code === 0;
        if (!success && throwOnError) {
          const error = new Error(`Command failed with code ${code}`);
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          throw error;
        }
        resolve({
          success,
          code,
          stdout,
          stderr
        });
      });
    });
  },

  /**
   * Run a series of commands in sequence
   * @param {Array<{command: string, cwd?: string}>} commands - Array of commands to execute
   * @param {Object} [options] - Execution options
   * @returns {Promise<Array<{command: string, result: Object}>>}
   */
  async runCommands(commands, options = {}) {
    const results = [];
    for (const cmd of commands) {
      try {
        const result = await this.executeCommand(cmd.command, {
          cwd: cmd.cwd,
          ...options
        });
        results.push({
          command: cmd.command,
          success: result.success,
          ...result
        });
      } catch (error) {
        results.push({
          command: cmd.command,
          success: false,
          error: error.message,
          code: error.code,
          stdout: error.stdout,
          stderr: error.stderr
        });
        if (options.stopOnError) {
          throw error;
        }
      }
    }
    return results;
  },

  /**
   * Execute a command with sudo/administrator privileges
   * @param {string} command - Command to execute with elevated privileges
   * @param {Object} [options] - Execution options
   * @returns {Promise<Object>} - Command execution result
   */
  async sudo(command, options = {}) {
    const isWindows = process.platform === 'win32';
    const sudoCommand = isWindows
      ? `powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c ${command.replace(/"/g, '\"')}'"`
      : `sudo ${command}`;
    
    return this.executeCommand(sudoCommand, options);
  },

  /**
   * Check if a command is available in the system PATH
   * @param {string} command - Command to check
   * @returns {Promise<boolean>} - True if command is available
   */
  async isCommandAvailable(command) {
    try {
      const checkCmd = process.platform === 'win32'
        ? `where ${command}`
        : `command -v ${command}`;
      
      const result = await this.executeCommand(checkCmd, { verbose: false });
      return result.success;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get the current working directory
   * @returns {string} - Current working directory
   */
  getCwd() {
    return process.cwd();
  },

  /**
   * Change the current working directory
   * @param {string} dir - Directory to change to
   */
  chdir(dir) {
    process.chdir(dir);
  },

  // Execute shell command (async) - Legacy method
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
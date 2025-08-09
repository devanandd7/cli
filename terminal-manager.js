const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class TerminalManager {
  constructor() {
    this.isWindows = process.platform === 'win32';
    this.activeProcesses = new Map();
    this.logsDir = path.join(os.tmpdir(), 'gemini-cli-logs');
    
    // Ensure logs directory exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Execute a command in a new terminal window
   * @param {string} command - Command to execute
   * @param {Object} options - Execution options
   * @param {string} [options.title='Gemini CLI Task'] - Window title
   * @param {string} [options.cwd=process.cwd()] - Working directory
   * @param {boolean} [options.wait=true] - Wait for command to complete
   * @param {boolean} [options.keepOpen=true] - Keep terminal open after command completes
   * @returns {Promise<{success: boolean, outputPath: string, pid: number}>}
   */
  async executeInNewTerminal(command, options = {}) {
    const {
      title = 'Gemini CLI Task',
      cwd = process.cwd(),
      wait = true,
      keepOpen = true
    } = options;

    const logFile = path.join(this.logsDir, `${uuidv4()}.log`);
    const logStream = fs.createWriteStream(logFile);
    
    let fullCommand = command;
    
    // Create a command that will run in the new terminal
    if (this.isWindows) {
      // Windows command
      const keepCmd = keepOpen ? '/k' : '/c';
      const waitCmd = wait ? ' & pause' : '';
      fullCommand = `"${command}${waitCmd}"`;
      
      return new Promise((resolve) => {
        const terminal = spawn('cmd.exe', [
          '/s',
          '/c',
          `start "${title}" ${keepCmd} ${fullCommand}`
        ], {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          windowsHide: false
        });

        this._handleProcess(terminal, logStream, resolve, logFile);
      });
    } else {
      // Unix-like systems (macOS, Linux)
      const term = process.env.TERMINAL || 'x-terminal-emulator';
      const keepCmd = keepOpen ? '; $SHELL' : '';
      
      return new Promise((resolve) => {
        const terminal = spawn(term, [
          '-e',
          `bash -c "${command}${keepCmd}; echo '\nPress any key to exit...'; read -n 1"`
        ], {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          detached: true
        });

        this._handleProcess(terminal, logStream, resolve, logFile);
      });
    }
  }

  /**
   * Handle process events and logging
   * @private
   */
  _handleProcess(process, logStream, resolve, logFile) {
    const pid = process.pid;
    
    // Log output to file
    process.stdout.on('data', (data) => {
      const output = data.toString();
      logStream.write(`[OUT] ${output}`);
      console.log(`[PID:${pid}] ${output}`);
    });

    process.stderr.on('data', (data) => {
      const error = data.toString();
      logStream.write(`[ERR] ${error}`);
      console.error(`[PID:${pid}] ${error}`);
    });

    // Handle process exit
    process.on('close', (code) => {
      logStream.write(`[INFO] Process exited with code ${code}\n`);
      logStream.end();
      this.activeProcesses.delete(pid);
      
      resolve({
        success: code === 0,
        exitCode: code,
        outputPath: logFile,
        pid
      });
    });

    // Store process reference
    this.activeProcesses.set(pid, {
      process,
      logFile,
      startTime: new Date(),
      command: process.spawnargs.join(' ')
    });
  }

  /**
   * Get information about a running process
   * @param {number} pid - Process ID
   * @returns {Object|null} Process info or null if not found
   */
  getProcessInfo(pid) {
    const proc = this.activeProcesses.get(pid);
    if (!proc) return null;
    
    return {
      pid,
      command: proc.command,
      startTime: proc.startTime,
      logFile: proc.logFile,
      running: !proc.process.killed
    };
  }

  /**
   * Kill a running process
   * @param {number} pid - Process ID
   * @returns {boolean} True if process was killed, false otherwise
   */
  killProcess(pid) {
    const proc = this.activeProcesses.get(pid);
    if (!proc) return false;
    
    try {
      if (this.isWindows) {
        // On Windows, we need to kill the entire process tree
        spawn('taskkill', ['/F', '/T', '/PID', pid]);
      } else {
        process.kill(-pid, 'SIGTERM'); // Negative PID to kill the process group
      }
      return true;
    } catch (error) {
      console.error(`Failed to kill process ${pid}:`, error);
      return false;
    }
  }

  /**
   * List all active processes
   * @returns {Array} List of active processes
   */
  listProcesses() {
    return Array.from(this.activeProcesses.entries()).map(([pid, proc]) => ({
      pid,
      command: proc.command,
      startTime: proc.startTime,
      logFile: proc.logFile,
      running: !proc.process.killed
    }));
  }
}

// Create a singleton instance
const terminalManager = new TerminalManager();

// Cleanup on process exit
process.on('exit', () => {
  // Kill all child processes
  terminalManager.listProcesses().forEach(proc => {
    if (proc.running) {
      terminalManager.killProcess(proc.pid);
    }
  });
});

module.exports = terminalManager;

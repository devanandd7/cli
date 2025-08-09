// Import required modules
const readline = require('readline');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ProjectManager = require('./project-manager');
const tools = require('./tools');
const path = require('path');
const fs = require('fs');

const GOOGLE_API_KEY = "AIzaSyBWHT84y5FNDG6Pjikc7x27vjMYeGofyS0";
// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// Initialize Project Manager
const projectManager = new ProjectManager();

// System prompt with tool usage instructions
const systemPrompt = `You are an advanced AI assistant with the following capabilities:

1. Project Planning:
   - When discussing a new project, first generate a project structure and task list
   - Save the plan to project.txt using the saveProjectPlan tool
   - For project-related queries, always check project.txt first

2. Available Tools:
   - readFile(filePath): Read file content
   - writeFile(filePath, content): Write to file
   - exists(path): Check if file/directory exists
   - readDir(dirPath): List directory contents
   - execCommand(command): Execute shell command
   - spawnProcess(command, args): Spawn process with streaming output
   - saveProjectPlan(plan): Save project plan to project.txt
   - getNextTask(): Get the next pending task
   - executeNextTask(): Execute the next task in the project

3. Project Management:
   - Always maintain a clear project structure and task list
   - When asked to start building, execute tasks one by one
   - After each task, update the task status in project.txt

4. Response Format:
   - For project planning: Provide a clear structure and task list
   - For task execution: Show progress and results of each step
   - For errors: Provide detailed error messages and suggestions

Current working directory: ${process.cwd()}
`;

// Chat history
let chatHistory = [];

// Create readline interface for CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to process tool calls from Gemini's response
async function processToolCalls(toolCalls) {
  const results = [];
  
  for (const call of toolCalls) {
    const { name, args } = call;
    let result;
    
    try {
      // Handle tool calls based on the function name
      switch (name) {
        case 'readFile':
          result = await tools.readFile(args.filePath);
          break;
          
        case 'writeFile':
          result = await tools.writeFile(args.filePath, args.content);
          break;
          
        case 'exists':
          result = await tools.exists(args.path);
          break;
          
        case 'readDir':
          result = await tools.readDir(args.dirPath);
          break;
          
        case 'execCommand':
          result = await tools.execCommand(args.command, args.options || {});
          break;
          
        case 'spawnProcess':
          result = await tools.spawnProcess(args.command, args.args || [], args.options || {});
          break;
          
        case 'saveProjectPlan':
          result = await projectManager.saveProjectPlan();
          break;
          
        case 'getNextTask':
          result = { task: projectManager.getNextTask() };
          break;
          
        case 'executeNextTask':
          result = await projectManager.executeNextTask();
          break;
          
        default:
          result = { error: `Unknown tool: ${name}` };
      }
      
      results.push({
        toolCallId: call.id,
        name,
        result: JSON.stringify(result)
      });
      
    } catch (error) {
      results.push({
        toolCallId: call.id,
        name,
        error: error.message
      });
    }
  }
  
  return results;
}

// Track if we're in build mode
let isBuilding = false;
let currentTaskIndex = 0;

// Function to detect project type from prompt and return project info
function detectProjectType(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  
  // Check for specific project types
  if (/(todo|to-do|task)/i.test(lowerPrompt)) {
    return { type: 'todo', isProject: true };
  } else if (/(react|frontend|webapp|website|web app)/i.test(lowerPrompt)) {
    return { type: 'react', isProject: true };
  } else if (/(node|backend|api)/i.test(lowerPrompt)) {
    return { type: 'node', isProject: true };
  } 
  // Check for generic project requests
  else if (/(create|make|build|start).*(project|app|website|web app|drawing|game)/i.test(lowerPrompt)) {
    // Extract project name if mentioned
    const match = prompt.match(/(create|make|build|start)\s+(?:a |an |the )?(.+?)(?:\s+(?:project|app|website|web app|drawing|game))?\b/i);
    const projectName = match && match[2] ? match[2].trim() : 'custom';
    return { 
      type: projectName, 
      isProject: true,
      custom: true
    };
  }
  
  return { isProject: false };
}

// Function to find project.txt in the current directory
function findProjectFile() {
  const cwd = process.cwd();
  const projectPath = path.resolve(cwd, 'project.txt');
  
  // Check if project.txt exists in current directory
  const { success: fileExists } = tools.existsSync(projectPath);
  
  if (!fileExists) {
    // If not found, try to find it in subdirectories (up to 2 levels deep)
    try {
      const files = tools.searchFilesSync(cwd, /project\.txt$/, { maxDepth: 2 });
      if (files.results && files.results.length > 0) {
        return { 
          success: true, 
          path: files.results[0].path,
          foundInSubdir: path.dirname(files.results[0].path) !== cwd
        };
      }
    } catch (error) {
      console.error('Error searching for project file:', error);
    }
    
    return { 
      success: false, 
      error: 'No project.txt found in current directory or subdirectories. Please create a project first.' 
    };
  }
  
  return { 
    success: true, 
    path: projectPath,
    foundInSubdir: false
  };
}

// Function to get the project file contents
function getProjectContext() {
  // First, find the project file
  const findResult = findProjectFile();
  if (!findResult.success) {
    return findResult; // Return the error
  }
  
  const { path: projectPath, foundInSubdir } = findResult;
  
  // Notify if found in subdirectory
  if (foundInSubdir) {
    console.log(`Found project file at: ${projectPath}`);
  }
  
  // Read the project file
  const { success, content } = tools.readFileSync(projectPath);
  if (!success) {
    return { success: false, error: 'Failed to read project plan.' };
  }
  
  return { 
    success: true, 
    path: projectPath,
    content,
    directory: path.dirname(projectPath)
  };
}

// Function to create directory structure and write file contents
async function createProjectStructure(structure, basePath = '') {
  const results = [];
  
  for (const item of structure) {
    const itemPath = path.join(basePath, item.path || item);
    const fullPath = path.resolve(process.cwd(), itemPath);
    
    try {
      if (item.endsWith('/') || (item.type && item.type === 'directory')) {
        // It's a directory
        if (!tools.existsSync(fullPath).success) {
          tools.mkdirSync(fullPath, { recursive: true });
          results.push({ type: 'dir', path: itemPath, status: 'created' });
        } else {
          results.push({ type: 'dir', path: itemPath, status: 'exists' });
        }
      } else {
        // It's a file
        const dirPath = path.dirname(fullPath);
        if (!tools.existsSync(dirPath).success) {
          tools.mkdirSync(dirPath, { recursive: true });
        }
        
        // Check if file exists and has content
        const fileExists = tools.existsSync(fullPath).exists;
        const shouldWriteContent = item.content && (item.overwrite || !fileExists);
        
        if (shouldWriteContent) {
          // Write file with content
          const writeResult = tools.writeFileSync(fullPath, item.content);
          if (writeResult.success) {
            results.push({ 
              type: 'file', 
              path: itemPath, 
              status: 'created', 
              hasContent: true,
              content: item.content
            });
          } else {
            throw new Error(`Failed to write content: ${writeResult.error}`);
          }
        } else if (!fileExists) {
          // Create empty file if it doesn't exist
          tools.writeFileSync(fullPath, '');
          results.push({ 
            type: 'file', 
            path: itemPath, 
            status: 'created',
            hasContent: false
          });
        } else {
          // File exists and we're not overwriting
          results.push({ 
            type: 'file', 
            path: itemPath, 
            status: 'exists',
            hasContent: true
          });
        }
        
        // Verify file content if it was supposed to have content
        if (item.content && !shouldWriteContent) {
          const { success: readSuccess, content: existingContent } = tools.readFileSync(fullPath);
          if (readSuccess && existingContent !== item.content) {
            results.push({
              type: 'warning',
              message: `Content mismatch for ${itemPath}. File exists with different content.`,
              expected: item.content,
              actual: existingContent
            });
          }
        }
      }
    } catch (error) {
      results.push({ 
        type: 'error',
        path: itemPath,
        message: `Failed to process: ${error.message}`,
        error: error.stack
      });
    }
  }
  
  return results;
}

// Function to execute the next pending task
async function executeNextTask() {
  try {
    // Get project context
    const projectContext = getProjectContext();
    if (!projectContext.success) {
      isBuilding = false;
      return projectContext.error;
    }
    
    const { content, path: projectPath, directory } = projectContext;
    console.log(`Reading project from: ${projectPath}`);
    
    // Parse project structure and tasks
    const lines = content.split('\n');
    let inStructureSection = false;
    let inTasksSection = false;
    const structure = [];
    const tasks = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('## Project Structure')) {
        inStructureSection = true;
        inTasksSection = false;
        continue;
      } else if (trimmedLine.startsWith('## Tasks')) {
        inStructureSection = false;
        inTasksSection = true;
        continue;
      } else if (trimmedLine.startsWith('##')) {
        inStructureSection = false;
        inTasksSection = false;
        continue;
      }
      
      if (inStructureSection && trimmedLine.startsWith('- ')) {
        const item = trimmedLine.substring(1).trim();
        if (item) structure.push(item);
      } else if (inTasksSection && trimmedLine.match(/^\s*- \[.\]/)) {
        const taskMatch = trimmedLine.match(/^\s*- \[(.)\]\s*(.+?)\s*$/);
        if (taskMatch) {
          tasks.push({
            completed: taskMatch[1].toLowerCase() === 'x',
            description: taskMatch[2].trim(),
            rawLine: trimmedLine
          });
        }
      }
    }
    
    // If this is the first task, create the project structure and write file contents
    if (currentTaskIndex === 0) {
      console.log('\n🚀 Setting up project structure and writing files...');
      const results = await createProjectStructure(structure);
      
      // Process and log results
      let hasErrors = false;
      results.forEach(result => {
        switch (result.type) {
          case 'dir':
            console.log(`  ${result.status === 'created' ? '📁 Created' : '📁 Exists'}: ${result.path}`);
            break;
          case 'file':
            if (result.hasContent) {
              console.log(`  📝 ${result.status === 'created' ? 'Wrote' : 'Verified'}: ${result.path}`);
            } else {
              console.log(`  📄 ${result.status === 'created' ? 'Created' : 'Exists'}: ${result.path} (empty)`);
            }
            break;
          case 'warning':
            console.log(`  ⚠️  Warning: ${result.message}`);
            console.log(`     Expected: ${result.expected?.substring(0, 50)}...`);
            console.log(`     Actual: ${result.actual?.substring(0, 50)}...`);
            break;
          case 'error':
            console.error(`  ❌ Error: ${result.message}`);
            console.error(`     ${result.error}`);
            hasErrors = true;
            break;
        }
      });
      
      if (hasErrors) {
        return '❌ Encountered errors while setting up the project. Please check the logs above.';
      }
      
      console.log('✅ Project structure and files created successfully\n');
      
      // If there are no tasks, we're done
      if (tasks.length === 0) {
        isBuilding = false;
        return '✅ Project setup complete with no additional tasks.';
      }
    }
    
    // Process tasks
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for the Tasks section
      if (trimmedLine.startsWith('## Tasks')) {
        inTasksSection = true;
        continue;
      }
      
      // Skip empty lines or section headers after tasks section starts
      if (!inTasksSection || !trimmedLine || trimmedLine.startsWith('## ')) {
        continue;
      }
      
      // Match task items (both [ ] and [x] formats)
      const taskMatch = trimmedLine.match(/^\s*-\s*\[(.)\]\s*(.+?)\s*$/);
      if (taskMatch) {
        const completed = taskMatch[1].toLowerCase() === 'x';
        const description = taskMatch[2].trim();
        tasks.push({ description, completed, rawLine: trimmedLine });
      }
    }
    
    console.log(`Found ${tasks.length} tasks in project file`);
    if (tasks.length === 0) {
      return 'No tasks found in project file.';
    }
    
    // Find the next incomplete task
    const nextTaskIndex = tasks.findIndex(task => !task.completed);
    
    if (nextTaskIndex === -1) {
      isBuilding = false;
      return '✅ All tasks completed! Project is ready.';
    }
    
    const nextTask = tasks[nextTaskIndex];
    
    // Change to the project directory
    const originalCwd = process.cwd();
    if (directory) {
      process.chdir(directory);
    }
    
    // Execute the task
    console.log(`\n🚀 Executing task: ${nextTask.description}`);
    
    try {
      // Simple task execution - in a real app, you'd have more sophisticated task handlers
      console.log(`Performing: ${nextTask.description}`);
      
      // Mark task as complete in project.txt
      const updatedContent = content.split('\n').map(line => {
        if (line.trim() === nextTask.rawLine) {
          return line.replace(/\[.\](.*)/, `[x]$1`);
        }
        return line;
      }).join('\n');
      
      // Write the updated content back to the file
      const writeResult = tools.writeFileSync(projectPath, updatedContent);
      if (!writeResult.success) {
        throw new Error(`Failed to update project file: ${writeResult.error}`);
      }
      
      console.log(`✅ Task completed: ${nextTask.description}`);
      
      // Check if there are more tasks
      const remainingTasks = tasks.filter(t => !t.completed).length - 1; // -1 because we just completed one
      if (remainingTasks > 0) {
        return `Task completed! ${remainingTasks} tasks remaining. Type 'next' to continue or 'stop' to cancel.`;
      } else {
        isBuilding = false;
        return '✅ All tasks completed! Project is ready.';
      }
    } catch (error) {
      return `❌ Task failed: ${error.message || 'Unknown error'}`;
    } finally {
      // Restore the original working directory
      if (originalCwd) {
        process.chdir(originalCwd);
      }
    }
  } catch (error) {
    isBuilding = false;
    console.error('Error in executeNextTask:', error);
    return `❌ Error executing task: ${error.message}`;
  }
}

// Function to initialize a new project
async function initializeProject(projectType) {
  // If we're already in build mode, just continue with the next task
  if (isBuilding) {
    return await executeNextTask();
  }
  try {
    console.log(`Initializing ${projectType} project...`);
    
    // Ensure we have a valid project type
    if (!projectType) {
      projectType = 'custom';
    }
    
    // Generate project plan
    const plan = await projectManager.generateProjectPlan(projectType);
    
    // Format the project content
    let content = `# ${plan.projectType} Project\n\n`;
    content += '## Project Structure\n';
    content += plan.structure.map(item => `- ${item}`).join('\n');
    content += '\n\n## Tasks\n';
    content += plan.tasks.map(task => `- [ ] ${task.description || task}`).join('\n');
    
    // Ensure project.txt exists and is writable
    const projectFilePath = path.join(process.cwd(), 'project.txt');
    
    // Write to project.txt
    const writeResult = tools.writeFileSync(projectFilePath, content);
    
    if (writeResult.success) {
      return `✅ Project initialized successfully!\n\nProject details have been saved to project.txt\n\n${content}`;
    } else {
      console.error('Failed to write project.txt:', writeResult.error);
      return `✅ Project initialized, but failed to save to project.txt: ${writeResult.error}\n\n${content}`;
    }
  } catch (error) {
    console.error('Error in initializeProject:', error);
    return `❌ Failed to initialize project: ${error.message}`;
  }
}

// Function to get response from Gemini with project context
async function getGeminiResponse(prompt) {
  try {
    // Add project context if available
    let context = '';
    const projectContext = getProjectContext();
    if (projectContext.success) {
      context = `\n\nCurrent Project Context:\n${projectContext.content}\n\n`;
    }
    
    const fullPrompt = context + prompt;
    // Check if user wants to start building
    if (prompt.toLowerCase().includes('start building') || prompt.toLowerCase().includes('make project')) {
      isBuilding = true;
      return await executeNextTask();
    }
    
    // Check if this is a project-related prompt
    const { type, isProject, custom } = detectProjectType(prompt);
    if (isProject) {
      return await initializeProject(type);
    }

    // If not a project init request, use Gemini
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
      },
      systemInstruction: systemPrompt
    });
    
    // Start a new chat session
    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: 2000,
      },
    });

    // Send the prompt and get response
    const result = await chat.sendMessage(fullPrompt);
    const response = await result.response;
    const text = response.text();
    
    // Update chat history with user message and AI response
    chatHistory.push(
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: [{ text }] }
    );
    
    // Keep chat history within a reasonable size
    if (chatHistory.length > 20) {
      chatHistory = chatHistory.slice(-20);
    }
    
    return text;
  } catch (error) {
    console.error('Error getting response from Gemini:', error);
    return 'Sorry, I encountered an error processing your request.';
  }
}

// Function to search files in the current directory
async function searchFiles(pattern, options = {}) {
  try {
    const currentDir = process.cwd();
    const result = tools.searchFilesSync(currentDir, new RegExp(pattern, 'i'), options);
    
    if (!result.success) {
      return `Error searching files: ${result.error}`;
    }
    
    if (result.results.length === 0) {
      return 'No files found matching your search.';
    }
    
    let output = `Found ${result.results.length} items:\n`;
    result.results.forEach((item, index) => {
      const type = item.type === 'directory' ? '📁' : '📄';
      const size = item.size ? ` (${formatFileSize(item.size)})` : '';
      output += `${index + 1}. ${type} ${item.path.replace(currentDir + path.sep, '')}${size}\n`;
    });
    
    return output;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Function to handle user input
async function handleUserInput(input) {
  const trimmedInput = input.trim();
  
  // Handle search command
  if (trimmedInput.startsWith('search ') || trimmedInput.startsWith('find ')) {
    const searchTerm = trimmedInput.split(' ').slice(1).join(' ');
    if (!searchTerm) {
      console.log('Please provide a search term. Example: search .js');
      return;
    }
    const results = await searchFiles(searchTerm, { recursive: true });
    console.log('\n' + results);
    return;
  }
  
  if (trimmedInput.toLowerCase() === 'exit') {
    console.log('Goodbye!');
    process.exit(0);
  }
  
  // Handle next command during build
  if ((input.toLowerCase() === 'next' || input.toLowerCase() === 'continue') && isBuilding) {
    const response = await executeNextTask();
    console.log('\nAI:', response);
  } 
  // Handle stop command during build
  else if (input.toLowerCase() === 'stop' && isBuilding) {
    isBuilding = false;
    console.log('\nAI: Build process stopped.');
  } 
  else {
    console.log('\nAI is thinking...');
    const response = await getGeminiResponse(input);
    console.log('\nAI:', response);
  }
}

// Main function to run the CLI
function runCLI() {
  console.log('Gemini AI CLI - Type your message or type "exit" to quit');
  console.log('Available commands:');
  console.log('- search <pattern>  : Search for files in the current directory');
  console.log('- find <pattern>    : Alias for search');
  console.log('- next/continue     : Execute the next task (in build mode)');
  console.log('- stop              : Stop the current build process');
  console.log('- exit              : Exit the CLI');
  
  const askQuestion = () => {
    rl.question('\nYou: ', async (input) => {
      await handleUserInput(input);
      askQuestion(); // Continue the conversation
    });
  };
  
  // Start the conversation
  askQuestion();
}

console.log(GOOGLE_API_KEY);
// Check for API key
if (!GOOGLE_API_KEY) {
  console.error('Error: GOOGLE_API_KEY environment variable is not set.');
  console.log('Please set your Google API key using:');
  console.log('Windows: set GOOGLE_API_KEY=your_api_key_here');
  console.log('Linux/Mac: export GOOGLE_API_KEY=your_api_key_here');
  process.exit(1);
}

// Start the CLI
runCLI();

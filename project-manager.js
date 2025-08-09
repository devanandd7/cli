const tools = require('./tools');
const path = require('path');

class ProjectManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.projectPlanPath = path.join(projectRoot, 'project.txt');
    this.currentPlan = null;
    this.currentTaskIndex = 0;
  }

  // Initialize or load project plan
  async initializeProject(projectType) {
    try {
      // Create new plan based on project type
      this.currentPlan = await this.generateProjectPlan(projectType);
      
      // Save the generated plan
      const saveResult = await this.saveProjectPlan();
      if (!saveResult.success) {
        return { success: false, error: 'Failed to save project plan' };
      }
      
      return { 
        success: true, 
        message: `Created new ${projectType} project plan`,
        plan: this.currentPlan
      };
    } catch (error) {
      console.error('Error in initializeProject:', error);
      return { success: false, error: error.message };
    }
  }

  // Parse project plan from text
  parseProjectPlan(content) {
    const lines = content.split('\n').filter(line => line.trim());
    const plan = {
      projectType: '',
      structure: [],
      tasks: []
    };

    let currentSection = null;

    for (const line of lines) {
      if (line.startsWith('## Project Type:')) {
        plan.projectType = line.split(':')[1]?.trim() || '';
      } else if (line.startsWith('## Project Structure:')) {
        currentSection = 'structure';
      } else if (line.startsWith('## Task List:')) {
        currentSection = 'tasks';
      } else if (line.startsWith('- [ ] ')) {
        plan.tasks.push({
          description: line.replace('- [ ] ', '').trim(),
          completed: false
        });
      } else if (line.startsWith('- [x] ')) {
        plan.tasks.push({
          description: line.replace('- [x] ', '').trim(),
          completed: true
        });
      } else if (line.startsWith('- ')) {
        if (currentSection === 'structure') {
          plan.structure.push(line.replace('- ', '').trim());
        }
      }
    }

    return plan;
  }

  // Generate project plan based on type
  async generateProjectPlan(projectType) {
    // Default plan template for custom project types
    if (!projectType || projectType === 'custom') {
      projectType = 'Custom Project';
    }
    
    // Convert project type to title case
    projectType = projectType.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    let planTemplate = {
      projectType,
      structure: [
        'src/',
        'public/',
        'docs/'
      ],
      tasks: [
        'Initialize project',
        'Set up project structure',
        'Install required dependencies',
        'Implement core features',
        'Test the application',
        'Deploy the project'
      ]
    };

    // Generate project-specific structure and tasks
    switch (projectType.toLowerCase()) {
      case 'react':
      case 'react app':
      case 'react application':
        planTemplate = {
          projectType: 'React Application',
          structure: [
            'public/',
            'public/index.html',
            'public/robots.txt',
            'src/',
            'src/components/',
            'src/pages/',
            'src/assets/',
            'src/styles/',
            'src/App.js',
            'src/index.js',
            'src/index.css',
            'package.json',
            'README.md',
            '.gitignore',
            'package-lock.json'
          ],
          tasks: [
            'Initialize React application using create-react-app',
            'Set up project folder structure',
            'Install required dependencies (react-router-dom, axios, etc.)',
            'Configure routing',
            'Create layout components (Header, Footer, Navigation)',
            'Implement authentication (if needed)',
            'Create main pages and components',
            'Add styling (CSS Modules/Styled Components)',
            'Set up API integration',
            'Implement state management (Context API/Redux)',
            'Add form handling and validation',
            'Write unit tests',
            'Optimize performance',
            'Prepare for deployment',
            'Deploy application'
          ]
        };
        break;

      case 'todo':
      case 'todo app':
      case 'todo application':
        planTemplate = {
          projectType: 'Todo Application',
          structure: [
            'public/',
            'public/index.html',
            'src/',
            'src/components/',
            'src/components/TodoList.js',
            'src/components/TodoItem.js',
            'src/components/AddTodo.js',
            'src/components/Header.js',
            'src/components/Footer.js',
            'src/App.js',
            'src/index.js',
            'src/index.css',
            'package.json',
            'README.md',
            '.gitignore'
          ],
          tasks: [
            'Initialize React application',
            'Set up project structure',
            'Install required dependencies (react-icons, uuid)',
            'Create TodoList component',
            'Create TodoItem component',
            'Create AddTodo component',
            'Implement state management for todos',
            'Add functionality to add new todos',
            'Add functionality to toggle todo completion',
            'Add functionality to delete todos',
            'Add filtering (All/Active/Completed)',
            'Add local storage persistence',
            'Style the application',
            'Add responsive design',
            'Write tests',
            'Deploy the application'
          ]
        };
        break;

      default:
        // Generic project template
        planTemplate = {
          projectType,
          structure: [
            'src/',
            'public/',
            'docs/',
            'tests/',
            '.gitignore',
            'package.json',
            'README.md'
          ],
          tasks: [
            'Initialize project',
            'Set up project structure',
            'Install required dependencies',
            'Configure build tools',
            'Set up development environment',
            'Implement core features',
            'Write documentation',
            'Write tests',
            'Optimize performance',
            'Prepare for deployment'
          ]
        };
    }

    // Save the generated plan
    this.currentPlan = planTemplate;
    await this.saveProjectPlan();
    
    return planTemplate;
  }

  // Save project plan to file
  async saveProjectPlan() {
    if (!this.currentPlan) {
      return { success: false, error: 'No project plan to save' };
    }

    try {
      let content = `# ${this.currentPlan.projectType}\n\n`;
      content += '## Project Structure\n';
      content += this.currentPlan.structure.join('\n') + '\n\n';
      content += '## Tasks\n';
      content += this.currentPlan.tasks.map((task, index) => 
        `- [ ] ${task.description || task}`
      ).join('\n');

      // Ensure the directory exists
      const dir = require('path').dirname(this.projectPlanPath);
      if (!tools.existsSync(dir).exists) {
        await tools.mkdir(dir, { recursive: true });
      }

      // Save the file
      const result = await tools.writeFile(this.projectPlanPath, content);
      if (!result.success) {
        console.error('Failed to write project plan:', result.error);
        return { success: false, error: 'Failed to write project plan' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // Install dependencies
  async installDependencies(taskDescription) {
    try {
      let command = 'npm install';
      
      // Extract package names if mentioned
      const packageMatch = taskDescription.match(/install[\w\s-]+([a-z0-9-@/]+)/i);
      if (packageMatch && packageMatch[1]) {
        command = `npm install ${packageMatch[1]}`;
      }
      
      console.log(`Running: ${command}`);
      const result = await tools.exec(command);
      
      if (result.success) {
        return { success: true, message: 'Dependencies installed successfully' };
      } else {
        return { success: false, error: result.error || 'Failed to install dependencies' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // Handle creation tasks
  async handleCreationTask(taskDescription) {
    // This is a simplified version - in a real app, you'd have more specific handlers
    console.log(`Handling creation task: ${taskDescription}`);
    return { success: true, message: `Completed: ${taskDescription}` };
  }

  // Mark a task as complete in the project file
  async markTaskComplete(taskIndex) {
    try {
      // Read the current project file
      const { success, content } = tools.readFileSync(this.projectPlanPath);
      if (!success) {
        return { success: false, error: 'Failed to read project file' };
      }

      // Find and update the task
      const lines = content.split('\n');
      let taskCount = 0;
      let inTasksSection = false;
      let updated = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('## Tasks')) {
          inTasksSection = true;
          continue;
        }
        
        if (inTasksSection && line.startsWith('- [')) {
          if (taskCount === taskIndex) {
            // Mark task as completed
            lines[i] = lines[i].replace('- [ ]', '- [x]');
            updated = true;
            break;
          }
          taskCount++;
        }
      }

      if (!updated) {
        return { success: false, error: 'Task not found' };
      }

      // Write the updated content back to the file
      const writeResult = tools.writeFileSync(this.projectPlanPath, lines.join('\n'));
      if (!writeResult.success) {
        return { success: false, error: 'Failed to update project file' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error in markTaskComplete:', error);
      return { success: false, error: error.message };
    }
  }

  // Get next pending task
  getNextTask() {
    if (!this.currentPlan?.tasks) return null;
    
    const pendingTask = this.currentPlan.tasks.find(task => !task.completed);
    if (pendingTask) {
      this.currentTaskIndex = this.currentPlan.tasks.indexOf(pendingTask);
    }
    return pendingTask || null;
  }

  // Mark current task as complete
  completeCurrentTask() {
    if (this.currentPlan?.tasks[this.currentTaskIndex]) {
      this.currentPlan.tasks[this.currentTaskIndex].completed = true;
      this.saveProjectPlan();
      return true;
    }
    return false;
  }

  // Execute the next task
  async executeNextTask() {
    const task = this.getNextTask();
    if (!task) {
      return { success: true, completed: true, message: 'All tasks completed!' };
    }

    try {
      // Execute task based on description
      // This would be enhanced with AI to determine the right actions
      let result;
      
      if (task.description.toLowerCase().includes('initialize') && task.description.toLowerCase().includes('create-react-app')) {
        // Example: Initialize React app
        result = await tools.spawnProcess('npx', ['create-react-app', this.projectRoot]);
      } else if (task.description.toLowerCase().includes('install')) {
        // Example: Install dependencies
        const deps = task.description.match(/(npm|yarn|pnpm) (install|add) ([\w-]+)/i);
        if (deps) {
          result = await tools.spawnProcess(deps[1], [deps[2], deps[3]]);
        }
      } else {
        // Default action for other tasks
        result = { success: true, message: `Task completed: ${task.description}` };
      }

      if (result.success) {
        this.completeCurrentTask();
        return { 
          success: true, 
          completed: false, 
          message: `Completed: ${task.description}`,
          nextTask: this.getNextTask()?.description
        };
      } else {
        return { 
          success: false, 
          error: `Failed to execute: ${task.description}`, 
          details: result.error || result.stderr 
        };
      }
    } catch (error) {
      return { success: false, error: `Error executing task: ${error.message}` };
    }
  }
}

module.exports = ProjectManager;

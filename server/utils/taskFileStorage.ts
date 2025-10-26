import * as fs from 'fs';
import * as path from 'path';
import { MeetingTask } from '../transcriptService';

export class TaskFileStorage {
  private readonly TASKS_DIR = path.join(process.cwd(), 'tasks');

  constructor() {
    this.ensureDirectoryExists();
  }

  /**
   * Ensure tasks directory exists
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.TASKS_DIR)) {
      fs.mkdirSync(this.TASKS_DIR, { recursive: true });
      console.log(`📁 Created tasks directory at: ${this.TASKS_DIR}`);
    }
  }

  /**
   * Save tasks to file system
   * @param meetingId The meeting ID
   * @param tasks Array of tasks to save
   * @returns The file path where tasks were saved
   */
  async saveTasks(meetingId: string, tasks: MeetingTask[]): Promise<string> {
    try {
      const fileName = `tasks-${meetingId}.json`;
      const filePath = path.join(this.TASKS_DIR, fileName);

      // Create a human-readable text file as well
      const textFilePath = path.join(this.TASKS_DIR, `tasks-${meetingId}.txt`);
      
      // Save JSON format for programmatic access
      const fileContent = JSON.stringify({
        meetingId,
        tasks,
        savedAt: new Date().toISOString(),
        count: tasks.length
      }, null, 2);
      
      fs.writeFileSync(filePath, fileContent, 'utf8');
      
      // Create human-readable text format
      let textContent = `TASKS FOR MEETING: ${meetingId}\n`;
      textContent += `Generated: ${new Date().toLocaleString()}\n`;
      textContent += `Total Tasks: ${tasks.length}\n\n`;
      
      tasks.forEach((task, index) => {
        textContent += `TASK ${index + 1}: ${task.title}\n`;
        textContent += `Description: ${task.description}\n`;
        textContent += `Assignee: ${task.assignee || 'Unassigned'}\n`;
        textContent += `Priority: ${task.priority}\n`;
        textContent += `Status: ${task.status}\n`;
        textContent += `Due Date: ${task.dueDate ? new Date(task.dueDate).toLocaleString() : 'Not set'}\n`;
        textContent += `Category: ${task.category}\n`;
        textContent += `Estimated Hours: ${task.estimatedHours || 'Not specified'}\n\n`;
      });
      
      fs.writeFileSync(textFilePath, textContent, 'utf8');
      
      console.log(`📝 Tasks saved to text file: ${textFilePath}`);
      console.log(`💾 Tasks saved to JSON file: ${filePath}`);
      console.log(`✅ Successfully stored ${tasks.length} tasks for meeting: ${meetingId}`);
      
      return filePath;
    } catch (error: any) {
      console.error('❌ Error saving tasks to file:', error);
      throw new Error(`Failed to save tasks: ${error.message}`);
    }
  }

  /**
   * Get tasks from file system
   * @param meetingId The meeting ID
   * @returns Array of tasks or null if not found
   */
  async getTasks(meetingId: string): Promise<MeetingTask[] | null> {
    try {
      const fileName = `tasks-${meetingId}.json`;
      const filePath = path.join(this.TASKS_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        console.log(`⚠️ No task file found for meeting: ${meetingId}`);
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      
      console.log(`📖 Retrieved ${data.tasks.length} tasks from file for meeting: ${meetingId}`);
      return data.tasks;
    } catch (error: any) {
      console.error(`❌ Error reading tasks from file for meeting ${meetingId}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const taskFileStorage = new TaskFileStorage();
import { User } from '../shared/schema.js';
import { AgendaContent } from './agendaGenerator.js';
import { EmailValidationResult } from './attendeeValidator.js';
import { gmailService, BatchEmailResult, EmailSendResult } from './gmailService.js';
import { emailNotificationService } from './emailNotificationService.js';

/**
 * Interface for email sending job
 */
export interface EmailSendingJob {
  id: string;
  userId: string;
  meetingId: string;
  attendees: EmailValidationResult[];
  meetingData: any;
  agendaContent: AgendaContent;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'partially_failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  results?: BatchEmailResult;
  retryCount: number;
  maxRetries: number;
  errors: string[];
}

/**
 * Interface for retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  exponentialBackoff: boolean;
  retryableErrors: string[];
}

/**
 * Interface for email sending status
 */
export interface EmailSendingStatus {
  jobId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'partially_failed';
  totalAttendees: number;
  emailsSent: number;
  emailsFailed: number;
  progress: number; // 0-100
  errors: string[];
  results?: EmailSendResult[];
  estimatedTimeRemaining?: number;
}

/**
 * Email Workflow Orchestrator for managing agenda email distribution
 */
export class EmailWorkflowOrchestrator {
  private jobs: Map<string, EmailSendingJob> = new Map();
  private activeJobs: Set<string> = new Set();
  
  private readonly defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    retryDelayMs: 2000,
    exponentialBackoff: true,
    retryableErrors: [
      'Rate limit exceeded',
      'Temporary failure',
      'Network error',
      'Service unavailable',
      'Timeout'
    ]
  };

  /**
   * Start email sending workflow
   */
  async startEmailSendingWorkflow(
    user: User,
    meetingId: string,
    attendees: EmailValidationResult[],
    meetingData: any,
    agendaContent: AgendaContent,
    retryConfig?: Partial<RetryConfig>
  ): Promise<string> {
    const jobId = this.generateJobId();
    const config = { ...this.defaultRetryConfig, ...retryConfig };
    
    const job: EmailSendingJob = {
      id: jobId,
      userId: user.id,
      meetingId,
      attendees: attendees.filter(a => a.isValid), // Only send to valid emails
      meetingData,
      agendaContent,
      status: 'pending',
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: config.maxRetries,
      errors: []
    };

    this.jobs.set(jobId, job);
    
    // Create notification for job start
    emailNotificationService.notifyEmailJobStarted(
      user.id,
      jobId,
      job.attendees.length
    );
    
    // Start processing asynchronously
    this.processEmailJob(user, jobId, config).catch(error => {
      console.error(`Error processing email job ${jobId}:`, error);
      this.updateJobStatus(jobId, 'failed', [error.message]);
    });

    return jobId;
  }

  /**
   * Get email sending status
   */
  getEmailSendingStatus(jobId: string): EmailSendingStatus | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    const progress = this.calculateProgress(job);
    const estimatedTimeRemaining = this.estimateTimeRemaining(job);

    return {
      jobId: job.id,
      status: job.status,
      totalAttendees: job.attendees.length,
      emailsSent: job.results?.totalSent || 0,
      emailsFailed: job.results?.totalFailed || 0,
      progress,
      errors: job.errors,
      results: job.results?.results,
      estimatedTimeRemaining
    };
  }

  /**
   * Cancel email sending job
   */
  cancelEmailSendingJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed') {
      return false;
    }

    if (this.activeJobs.has(jobId)) {
      this.activeJobs.delete(jobId);
    }

    this.updateJobStatus(jobId, 'failed', ['Job cancelled by user']);
    return true;
  }

  /**
   * Retry failed email sending job
   */
  async retryEmailSendingJob(user: User, jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.retryCount >= job.maxRetries) {
      return false;
    }

    // Reset job status for retry
    job.status = 'pending';
    job.retryCount++;
    job.errors = [];
    job.results = undefined;

    // Start processing again
    this.processEmailJob(user, jobId, this.defaultRetryConfig).catch(error => {
      console.error(`Error retrying email job ${jobId}:`, error);
      this.updateJobStatus(jobId, 'failed', [error.message]);
    });

    return true;
  }

  /**
   * Process email sending job
   */
  private async processEmailJob(
    user: User,
    jobId: string,
    config: RetryConfig
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    this.activeJobs.add(jobId);
    this.updateJobStatus(jobId, 'in_progress');

    try {
      // Validate prerequisites
      await this.validateEmailPrerequisites(user, job);

      // Send emails with retry logic
      const result = await this.sendEmailsWithRetry(user, job, config);
      
      // Update job with results
      job.results = result;
      job.completedAt = new Date();

      // Determine final status
      if (result.totalFailed === 0) {
        this.updateJobStatus(jobId, 'completed');
      } else if (result.totalSent > 0) {
        this.updateJobStatus(jobId, 'partially_failed', result.errors);
      } else {
        this.updateJobStatus(jobId, 'failed', result.errors);
      }

      // Create completion notification
      const finalStatus = this.getEmailSendingStatus(jobId);
      if (finalStatus) {
        emailNotificationService.notifyEmailJobCompleted(user.id, jobId, finalStatus);
      }

    } catch (error) {
      console.error(`Email job ${jobId} failed:`, error);
      this.updateJobStatus(jobId, 'failed', [error instanceof Error ? error.message : 'Unknown error']);
      
      // Create failure notification
      const failedStatus = this.getEmailSendingStatus(jobId);
      if (failedStatus) {
        emailNotificationService.notifyEmailJobCompleted(user.id, jobId, failedStatus);
      }
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Send emails with retry logic
   */
  private async sendEmailsWithRetry(
    user: User,
    job: EmailSendingJob,
    config: RetryConfig
  ): Promise<BatchEmailResult> {
    let lastResult: BatchEmailResult | null = null;
    let attempt = 0;

    while (attempt <= config.maxRetries) {
      try {
        // Send batch emails
        const result = await gmailService.sendBatchAgendaEmails(
          user,
          job.attendees,
          job.meetingData,
          job.agendaContent
        );

        // If all emails sent successfully, return immediately
        if (result.totalFailed === 0) {
          return result;
        }

        // If this is not the last attempt and we have retryable failures
        if (attempt < config.maxRetries && this.hasRetryableErrors(result.errors, config)) {
          lastResult = result;
          attempt++;
          
          // Calculate delay with exponential backoff
          const delay = config.exponentialBackoff 
            ? config.retryDelayMs * Math.pow(2, attempt - 1)
            : config.retryDelayMs;
          
          console.log(`Retrying email job ${job.id}, attempt ${attempt}, delay: ${delay}ms`);
          await this.delay(delay);
          
          // Filter out successfully sent emails for retry
          job.attendees = job.attendees.filter(attendee => 
            !result.results.some(r => r.email === attendee.email && r.success)
          );
          
          continue;
        }

        return result;

      } catch (error) {
        console.error(`Email sending attempt ${attempt} failed:`, error);
        
        if (attempt >= config.maxRetries) {
          throw error;
        }
        
        attempt++;
        const delay = config.exponentialBackoff 
          ? config.retryDelayMs * Math.pow(2, attempt - 1)
          : config.retryDelayMs;
        
        await this.delay(delay);
      }
    }

    return lastResult || {
      totalSent: 0,
      totalFailed: job.attendees.length,
      results: job.attendees.map(a => ({
        email: a.email,
        success: false,
        error: 'Max retries exceeded'
      })),
      errors: ['Max retries exceeded']
    };
  }

  /**
   * Validate email sending prerequisites
   */
  private async validateEmailPrerequisites(user: User, job: EmailSendingJob): Promise<void> {
    const errors: string[] = [];

    // Check user access token
    if (!user.accessToken) {
      errors.push('User access token is missing');
    }

    // Check attendees
    if (job.attendees.length === 0) {
      errors.push('No valid attendees to send emails to');
    }

    // Check meeting data
    if (!job.meetingData.title) {
      errors.push('Meeting title is required');
    }

    // Check agenda content
    if (!job.agendaContent || job.agendaContent.topics.length === 0) {
      errors.push('Agenda content is required');
    }

    if (errors.length > 0) {
      throw new Error(`Email prerequisites validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Check if errors are retryable
   */
  private hasRetryableErrors(errors: string[], config: RetryConfig): boolean {
    return errors.some(error => 
      config.retryableErrors.some(retryableError => 
        error.toLowerCase().includes(retryableError.toLowerCase())
      )
    );
  }

  /**
   * Update job status
   */
  private updateJobStatus(
    jobId: string, 
    status: EmailSendingJob['status'], 
    errors: string[] = []
  ): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      if (errors.length > 0) {
        job.errors.push(...errors);
      }
      if (status === 'in_progress' && !job.startedAt) {
        job.startedAt = new Date();
      }
    }
  }

  /**
   * Calculate job progress percentage
   */
  private calculateProgress(job: EmailSendingJob): number {
    if (job.status === 'pending') return 0;
    if (job.status === 'completed') return 100;
    
    if (job.results) {
      const totalProcessed = job.results.totalSent + job.results.totalFailed;
      return Math.round((totalProcessed / job.attendees.length) * 100);
    }
    
    return job.status === 'in_progress' ? 50 : 0;
  }

  /**
   * Estimate remaining time for job completion
   */
  private estimateTimeRemaining(job: EmailSendingJob): number | undefined {
    if (job.status !== 'in_progress' || !job.startedAt || !job.results) {
      return undefined;
    }

    const elapsed = Date.now() - job.startedAt.getTime();
    const processed = job.results.totalSent + job.results.totalFailed;
    const remaining = job.attendees.length - processed;
    
    if (processed === 0) return undefined;
    
    const avgTimePerEmail = elapsed / processed;
    return Math.round(avgTimePerEmail * remaining);
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `email_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all jobs for a user
   */
  getUserEmailJobs(userId: string): EmailSendingJob[] {
    return Array.from(this.jobs.values()).filter(job => job.userId === userId);
  }

  /**
   * Clean up old completed jobs
   */
  cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): void { // Default 24 hours
    const cutoffTime = Date.now() - maxAgeMs;
    
    Array.from(this.jobs.entries()).forEach(([jobId, job]) => {
      if (job.status === 'completed' || job.status === 'failed') {
        const jobTime = job.completedAt?.getTime() || job.createdAt.getTime();
        if (jobTime < cutoffTime) {
          this.jobs.delete(jobId);
        }
      }
    });
  }

  /**
   * Get job statistics
   */
  getJobStatistics(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    partiallyFailed: number;
  } {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      partiallyFailed: 0
    };

    Array.from(this.jobs.values()).forEach(job => {
      switch (job.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'in_progress':
          stats.inProgress++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'partially_failed':
          stats.partiallyFailed++;
          break;
      }
    });

    return stats;
  }
}

// Export singleton instance
export const emailWorkflowOrchestrator = new EmailWorkflowOrchestrator();
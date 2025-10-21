export interface QualityCheck {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  check: (content: string, context?: any) => QualityIssue | null;
}

export interface QualityIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface QualityReport {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: QualityIssue[];
  strengths: string[];
  improvements: string[];
  metadata: {
    wordCount: number;
    estimatedReadingTime: number;
    sectionCount: number;
    hasTimeAllocations: boolean;
    hasActionItems: boolean;
    hasClearObjectives: boolean;
  };
}

export class AgendaQualityService {
  private qualityChecks: QualityCheck[] = [];

  constructor() {
    this.initializeQualityChecks();
  }

  private initializeQualityChecks(): void {
    this.qualityChecks = [
      // Content structure checks
      {
        id: 'minimum-length',
        name: 'Minimum Content Length',
        description: 'Agenda should have sufficient content',
        severity: 'error',
        check: (content: string) => {
          const wordCount = content.split(/\s+/).length;
          if (wordCount < 50) {
            return {
              id: 'minimum-length',
              type: 'error',
              message: `Agenda is too short (${wordCount} words). Minimum 50 words required.`,
              suggestion: 'Add more detailed descriptions, discussion points, or context to each agenda item.'
            };
          }
          return null;
        }
      },
      {
        id: 'maximum-length',
        name: 'Maximum Content Length',
        description: 'Agenda should not be excessively long',
        severity: 'warning',
        check: (content: string) => {
          const wordCount = content.split(/\s+/).length;
          if (wordCount > 2000) {
            return {
              id: 'maximum-length',
              type: 'warning',
              message: `Agenda is very long (${wordCount} words). Consider condensing for better readability.`,
              suggestion: 'Break into multiple shorter agendas or focus on key points only.'
            };
          }
          return null;
        }
      },

      // Structure checks
      {
        id: 'has-headings',
        name: 'Has Clear Headings',
        description: 'Agenda should use proper heading structure',
        severity: 'error',
        check: (content: string) => {
          const hasH1 = /<h1[^>]*>/.test(content);
          const hasH2 = /<h2[^>]*>/.test(content) || /<h3[^>]*>/.test(content);
          if (!hasH1 && !hasH2) {
            return {
              id: 'has-headings',
              type: 'error',
              message: 'Agenda lacks clear heading structure.',
              suggestion: 'Use H1 for main title and H2/H3 for section headings.'
            };
          }
          return null;
        }
      },
      {
        id: 'numbered-sections',
        name: 'Numbered Sections',
        description: 'Agenda should have numbered or bulleted sections',
        severity: 'warning',
        check: (content: string) => {
          const hasNumbers = /\d+\.\s/.test(content);
          const hasBullets = /[-*•]\s/.test(content);
          if (!hasNumbers && !hasBullets) {
            return {
              id: 'numbered-sections',
              type: 'warning',
              message: 'Agenda should include numbered or bulleted items for better organization.',
              suggestion: 'Use numbered lists for main agenda items and bullet points for sub-items.'
            };
          }
          return null;
        }
      },

      // Time allocation checks
      {
        id: 'time-allocations',
        name: 'Time Allocations',
        description: 'Agenda should include time allocations',
        severity: 'info',
        check: (content: string) => {
          const timePattern = /\(?\d+\s*(?:minute|min|hr|hour)s?\)?/gi;
          const hasTimeAllocations = timePattern.test(content);
          if (!hasTimeAllocations) {
            return {
              id: 'time-allocations',
              type: 'info',
              message: 'Consider adding time allocations for agenda items.',
              suggestion: 'Add estimated time for each section (e.g., "Discussion (15 min)") to help manage meeting pace.'
            };
          }
          return null;
        }
      },

      // Action items check
      {
        id: 'action-items',
        name: 'Action Items Section',
        description: 'Agenda should include action items or next steps',
        severity: 'warning',
        check: (content: string) => {
          const lowerContent = content.toLowerCase();
          const hasActionItems = lowerContent.includes('action') ||
                                lowerContent.includes('next steps') ||
                                lowerContent.includes('follow-up') ||
                                lowerContent.includes('deliverables');
          if (!hasActionItems) {
            return {
              id: 'action-items',
              type: 'warning',
              message: 'Agenda should include action items or next steps section.',
              suggestion: 'Add a section for capturing decisions, assignments, and follow-up items.'
            };
          }
          return null;
        }
      },

      // Clarity checks
      {
        id: 'clear-objectives',
        name: 'Clear Objectives',
        description: 'Agenda should state clear meeting objectives',
        severity: 'warning',
        check: (content: string) => {
          const lowerContent = content.toLowerCase();
          const hasObjectives = lowerContent.includes('objective') ||
                               lowerContent.includes('goal') ||
                               lowerContent.includes('purpose') ||
                               lowerContent.includes('aim');
          if (!hasObjectives) {
            return {
              id: 'clear-objectives',
              type: 'warning',
              message: 'Agenda should clearly state meeting objectives or purpose.',
              suggestion: 'Add a brief statement of what the meeting aims to achieve.'
            };
          }
          return null;
        }
      },

      // Professionalism checks
      {
        id: 'professional-tone',
        name: 'Professional Tone',
        description: 'Agenda should maintain professional tone',
        severity: 'info',
        check: (content: string) => {
          const lowerContent = content.toLowerCase();
          const informalWords = ['kinda', 'sorta', 'wanna', 'gonna', 'ain\'t', 'yeah', 'yep', 'nope'];
          const hasInformal = informalWords.some(word => lowerContent.includes(word));

          if (hasInformal) {
            return {
              id: 'professional-tone',
              type: 'info',
              message: 'Consider using more formal language for professional meetings.',
              suggestion: 'Replace casual expressions with professional alternatives.'
            };
          }
          return null;
        }
      },

      // Meeting logistics
      {
        id: 'meeting-logistics',
        name: 'Meeting Logistics',
        description: 'Agenda should include necessary meeting logistics',
        severity: 'info',
        check: (content: string, context?: any) => {
          const hasLogistics = content.includes('http') || // Meeting link
                              content.includes('zoom') ||
                              content.includes('teams') ||
                              content.includes('meet') ||
                              content.includes('location') ||
                              content.includes('room');

          if (!hasLogistics && context?.meetingLink) {
            return {
              id: 'meeting-logistics',
              type: 'info',
              message: 'Consider including meeting logistics (link, location, etc.) in the agenda.',
              suggestion: 'Add meeting link, location, or technical requirements to help attendees prepare.'
            };
          }
          return null;
        }
      }
    ];
  }

  /**
   * Analyze agenda content quality
   */
  analyzeQuality(content: string, context?: any): QualityReport {
    const issues: QualityIssue[] = [];
    const strengths: string[] = [];
    const improvements: string[] = [];

    // Run all quality checks
    for (const check of this.qualityChecks) {
      const issue = check.check(content, context);
      if (issue) {
        issues.push(issue);
        if (issue.type === 'warning' || issue.type === 'info') {
          improvements.push(issue.suggestion || issue.message);
        }
      }
    }

    // Analyze content metadata
    const metadata = this.analyzeContentMetadata(content, context);

    // Determine strengths based on what's present
    if (metadata.wordCount >= 200 && metadata.wordCount <= 1000) {
      strengths.push('Good content length for readability');
    }
    if (metadata.hasTimeAllocations) {
      strengths.push('Includes time allocations for better meeting management');
    }
    if (metadata.hasActionItems) {
      strengths.push('Includes clear action items and next steps');
    }
    if (metadata.hasClearObjectives) {
      strengths.push('Clearly states meeting objectives');
    }
    if (metadata.sectionCount >= 3) {
      strengths.push('Well-structured with multiple sections');
    }

    // Calculate overall score
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const infoCount = issues.filter(i => i.type === 'info').length;

    // Score calculation: Start with 100, deduct points for issues
    let score = 100;
    score -= errorCount * 20;    // -20 per error
    score -= warningCount * 10;  // -10 per warning
    score -= infoCount * 3;      // -3 per info

    // Bonus points for strengths
    score += Math.min(strengths.length * 5, 20); // Up to +20 for strengths

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    // Determine grade
    let grade: QualityReport['grade'];
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    return {
      score,
      grade,
      issues,
      strengths,
      improvements,
      metadata
    };
  }

  private analyzeContentMetadata(content: string, context?: any) {
    const wordCount = content.split(/\s+/).length;
    const estimatedReadingTime = Math.ceil(wordCount / 200); // Assume 200 words per minute

    // Count sections (rough estimate based on headings)
    const sectionCount = (content.match(/<h[1-6][^>]*>/g) || []).length;

    // Check for time allocations
    const timePattern = /\(?\d+\s*(?:minute|min|hr|hour)s?\)?/gi;
    const hasTimeAllocations = timePattern.test(content);

    // Check for action items
    const lowerContent = content.toLowerCase();
    const hasActionItems = lowerContent.includes('action') ||
                          lowerContent.includes('next steps') ||
                          lowerContent.includes('follow-up') ||
                          lowerContent.includes('deliverables');

    // Check for clear objectives
    const hasClearObjectives = lowerContent.includes('objective') ||
                              lowerContent.includes('goal') ||
                              lowerContent.includes('purpose') ||
                              lowerContent.includes('aim');

    return {
      wordCount,
      estimatedReadingTime,
      sectionCount,
      hasTimeAllocations,
      hasActionItems,
      hasClearObjectives
    };
  }

  /**
   * Get quality improvement suggestions
   */
  getImprovementSuggestions(content: string, context?: any): string[] {
    const report = this.analyzeQuality(content, context);
    return report.improvements;
  }

  /**
   * Validate agenda meets minimum quality standards
   */
  validateMinimumQuality(content: string, context?: any): { isValid: boolean; errors: string[] } {
    const report = this.analyzeQuality(content, context);
    const errors = report.issues.filter(issue => issue.type === 'error').map(issue => issue.message);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Enhance agenda content based on quality analysis
   */
  enhanceAgenda(content: string, context?: any): string {
    const report = this.analyzeQuality(content, context);
    let enhanced = content;

    // Add time allocations if missing
    if (!report.metadata.hasTimeAllocations && report.metadata.sectionCount > 0) {
      enhanced = this.addTimeAllocations(enhanced, context?.duration || 60);
    }

    // Add action items section if missing
    if (!report.metadata.hasActionItems) {
      enhanced = this.addActionItemsSection(enhanced);
    }

    // Add meeting purpose if missing
    if (!report.metadata.hasClearObjectives && context?.enhancedPurpose) {
      enhanced = this.addPurposeSection(enhanced, context.enhancedPurpose);
    }

    return enhanced;
  }

  private addTimeAllocations(content: string, totalMinutes: number): string {
    // Simple heuristic: distribute time across sections
    const sections = content.match(/<h[2-3][^>]*>.*?<\/h[2-3][^>]*>/gs) || [];
    if (sections.length === 0) return content;

    const timePerSection = Math.floor(totalMinutes / sections.length);
    let enhanced = content;

    sections.forEach((section, index) => {
      const sectionTitle = section.match(/<h[2-3][^>]*>(.*?)<\/h[2-3]>/)?.[1] || '';
      if (sectionTitle && !section.includes('min')) {
        const timeAllocation = ` (${timePerSection} min)`;
        enhanced = enhanced.replace(sectionTitle, `${sectionTitle}${timeAllocation}`);
      }
    });

    return enhanced;
  }

  private addActionItemsSection(content: string): string {
    const actionSection = `
<h2>Action Items & Next Steps</h2>
<p>Capture key decisions, assignments, and follow-up items from this meeting.</p>
<ul>
  <li>Document decisions made during the meeting</li>
  <li>Assign responsible parties for follow-up actions</li>
  <li>Set deadlines and success criteria</li>
</ul>
`;

    return content + actionSection;
  }

  private addPurposeSection(content: string, purpose: string): string {
    const purposeSection = `
<h2>Meeting Purpose</h2>
<p>${purpose}</p>
`;

    // Insert after title (after first h1)
    return content.replace(/(<h1[^>]*>.*?<\/h1>)/, `$1${purposeSection}`);
  }
}

// Export singleton instance
export const agendaQualityService = new AgendaQualityService();
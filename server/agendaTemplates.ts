export interface AgendaTemplate {
  id: string;
  name: string;
  description: string;
  category: 'standup' | 'planning' | 'review' | 'brainstorm' | 'decision' | 'training' | 'retrospective';
  estimatedDuration: number;
  sections: TemplateSection[];
  defaultTopics: string[];
  bestFor: string[];
}

export interface TemplateSection {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  isRequired: boolean;
  suggestedContent?: string;
  discussionPoints?: string[];
}

export class AgendaTemplateService {
  private templates: Map<string, AgendaTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    const templates: AgendaTemplate[] = [
      {
        id: 'daily-standup',
        name: 'Daily Standup',
        description: 'Quick daily check-in for team alignment and progress updates',
        category: 'standup',
        estimatedDuration: 15,
        defaultTopics: ['Yesterday', 'Today', 'Blockers'],
        bestFor: ['Agile teams', 'Remote teams', 'Development teams'],
        sections: [
          {
            id: 'welcome',
            title: 'Welcome & Check-in',
            description: 'Quick team check-in and agenda overview',
            estimatedMinutes: 2,
            isRequired: true,
            suggestedContent: 'Welcome everyone and do a quick round-robin check-in.'
          },
          {
            id: 'yesterday',
            title: 'What did you accomplish yesterday?',
            description: 'Share completed work and achievements',
            estimatedMinutes: 5,
            isRequired: true,
            discussionPoints: [
              'Key deliverables completed',
              'Milestones achieved',
              'Issues resolved',
              'Unexpected challenges overcome'
            ]
          },
          {
            id: 'today',
            title: 'What will you work on today?',
            description: 'Share planned work and priorities',
            estimatedMinutes: 5,
            isRequired: true,
            discussionPoints: [
              'Top priority tasks',
              'Dependencies needed',
              'Expected deliverables',
              'Time estimates'
            ]
          },
          {
            id: 'blockers',
            title: 'Any blockers or challenges?',
            description: 'Identify and address obstacles',
            estimatedMinutes: 3,
            isRequired: true,
            discussionPoints: [
              'Technical issues',
              'Resource constraints',
              'External dependencies',
              'Clarification needed'
            ]
          }
        ]
      },
      {
        id: 'sprint-planning',
        name: 'Sprint Planning',
        description: 'Plan and prioritize work for the upcoming sprint',
        category: 'planning',
        estimatedDuration: 120,
        defaultTopics: ['Sprint Goals', 'Backlog Review', 'Capacity Planning', 'Sprint Backlog'],
        bestFor: ['Agile teams', 'Product teams', 'Development teams'],
        sections: [
          {
            id: 'sprint-review',
            title: 'Sprint Review & Retrospective',
            description: 'Review previous sprint outcomes and lessons learned',
            estimatedMinutes: 15,
            isRequired: true,
            discussionPoints: [
              'What went well',
              'What could be improved',
              'Velocity and metrics',
              'Team feedback'
            ]
          },
          {
            id: 'sprint-goals',
            title: 'Sprint Goals & Objectives',
            description: 'Define clear goals for the upcoming sprint',
            estimatedMinutes: 20,
            isRequired: true,
            discussionPoints: [
              'Business objectives',
              'Technical goals',
              'Quality targets',
              'Success criteria'
            ]
          },
          {
            id: 'backlog-review',
            title: 'Product Backlog Review',
            description: 'Review and prioritize backlog items',
            estimatedMinutes: 30,
            isRequired: true,
            discussionPoints: [
              'User story refinement',
              'Acceptance criteria',
              'Story point estimation',
              'Priority ranking'
            ]
          },
          {
            id: 'capacity-planning',
            title: 'Team Capacity Planning',
            description: 'Assess team capacity and availability',
            estimatedMinutes: 15,
            isRequired: true,
            discussionPoints: [
              'Individual capacity',
              'Planned time off',
              'External commitments',
              'Buffer for unplanned work'
            ]
          },
          {
            id: 'sprint-backlog',
            title: 'Sprint Backlog Creation',
            description: 'Select and commit to sprint backlog items',
            estimatedMinutes: 30,
            isRequired: true,
            discussionPoints: [
              'Final story selection',
              'Task breakdown',
              'Risk assessment',
              'Sprint commitment'
            ]
          },
          {
            id: 'sprint-close',
            title: 'Sprint Planning Close',
            description: 'Finalize sprint plan and next steps',
            estimatedMinutes: 10,
            isRequired: true,
            discussionPoints: [
              'Sprint timeline',
              'Key milestones',
              'Communication plan',
              'Risk mitigation'
            ]
          }
        ]
      },
      {
        id: 'project-review',
        name: 'Project Review',
        description: 'Comprehensive review of project progress and outcomes',
        category: 'review',
        estimatedDuration: 90,
        defaultTopics: ['Progress Review', 'Risk Assessment', 'Stakeholder Updates', 'Next Phase Planning'],
        bestFor: ['Project teams', 'Cross-functional teams', 'Leadership reviews'],
        sections: [
          {
            id: 'project-overview',
            title: 'Project Overview',
            description: 'Current project status and context',
            estimatedMinutes: 10,
            isRequired: true,
            discussionPoints: [
              'Project objectives',
              'Current phase',
              'Timeline status',
              'Budget status'
            ]
          },
          {
            id: 'progress-review',
            title: 'Progress Review',
            description: 'Detailed review of completed work',
            estimatedMinutes: 25,
            isRequired: true,
            discussionPoints: [
              'Milestones achieved',
              'Deliverables completed',
              'Quality metrics',
              'Team performance'
            ]
          },
          {
            id: 'challenges-achievements',
            title: 'Challenges & Achievements',
            description: 'Highlight successes and address issues',
            estimatedMinutes: 15,
            isRequired: true,
            discussionPoints: [
              'Major accomplishments',
              'Lessons learned',
              'Issues encountered',
              'Problem resolutions'
            ]
          },
          {
            id: 'risk-assessment',
            title: 'Risk Assessment',
            description: 'Identify and mitigate project risks',
            estimatedMinutes: 15,
            isRequired: true,
            discussionPoints: [
              'Current risks',
              'Risk probability',
              'Impact assessment',
              'Mitigation strategies'
            ]
          },
          {
            id: 'stakeholder-updates',
            title: 'Stakeholder Updates',
            description: 'Communication and stakeholder management',
            estimatedMinutes: 10,
            isRequired: false,
            discussionPoints: [
              'Key stakeholder feedback',
              'Communication needs',
              'Escalation requirements',
              'Reporting requirements'
            ]
          },
          {
            id: 'next-phase',
            title: 'Next Phase Planning',
            description: 'Plan upcoming project activities',
            estimatedMinutes: 15,
            isRequired: true,
            discussionPoints: [
              'Upcoming milestones',
              'Resource needs',
              'Dependencies',
              'Success criteria'
            ]
          }
        ]
      },
      {
        id: 'brainstorming-session',
        name: 'Brainstorming Session',
        description: 'Creative ideation and problem-solving session',
        category: 'brainstorm',
        estimatedDuration: 60,
        defaultTopics: ['Problem Definition', 'Idea Generation', 'Idea Evaluation', 'Action Planning'],
        bestFor: ['Innovation teams', 'Problem-solving groups', 'Creative teams'],
        sections: [
          {
            id: 'problem-definition',
            title: 'Problem Definition',
            description: 'Clearly define the challenge or opportunity',
            estimatedMinutes: 10,
            isRequired: true,
            discussionPoints: [
              'Problem statement',
              'Background context',
              'Success criteria',
              'Constraints and limitations'
            ]
          },
          {
            id: 'idea-generation',
            title: 'Idea Generation',
            description: 'Generate creative solutions and ideas',
            estimatedMinutes: 25,
            isRequired: true,
            discussionPoints: [
              'Quantity over quality initially',
              'Build on others\' ideas',
              'Encourage wild ideas',
              'No criticism during generation'
            ]
          },
          {
            id: 'idea-evaluation',
            title: 'Idea Evaluation & Selection',
            description: 'Evaluate and prioritize generated ideas',
            estimatedMinutes: 15,
            isRequired: true,
            discussionPoints: [
              'Feasibility assessment',
              'Impact evaluation',
              'Resource requirements',
              'Implementation complexity'
            ]
          },
          {
            id: 'action-planning',
            title: 'Action Planning',
            description: 'Plan next steps for selected ideas',
            estimatedMinutes: 10,
            isRequired: true,
            discussionPoints: [
              'Implementation steps',
              'Responsible parties',
              'Timeline and milestones',
              'Success metrics'
            ]
          }
        ]
      },
      {
        id: 'decision-making',
        name: 'Decision Making Meeting',
        description: 'Structured meeting for making important decisions',
        category: 'decision',
        estimatedDuration: 75,
        defaultTopics: ['Decision Context', 'Options Analysis', 'Decision Criteria', 'Final Decision'],
        bestFor: ['Leadership teams', 'Cross-functional decisions', 'Strategic decisions'],
        sections: [
          {
            id: 'decision-context',
            title: 'Decision Context',
            description: 'Understand the decision to be made',
            estimatedMinutes: 10,
            isRequired: true,
            discussionPoints: [
              'Decision background',
              'Why this decision matters',
              'Timeline constraints',
              'Stakeholder impact'
            ]
          },
          {
            id: 'options-analysis',
            title: 'Options Analysis',
            description: 'Evaluate available options',
            estimatedMinutes: 25,
            isRequired: true,
            discussionPoints: [
              'Option identification',
              'Pros and cons analysis',
              'Risk assessment',
              'Resource implications'
            ]
          },
          {
            id: 'criteria-definition',
            title: 'Decision Criteria',
            description: 'Define criteria for decision making',
            estimatedMinutes: 15,
            isRequired: true,
            discussionPoints: [
              'Success criteria',
              'Must-have requirements',
              'Weighting factors',
              'Trade-off considerations'
            ]
          },
          {
            id: 'decision-making',
            title: 'Decision Making',
            description: 'Make the final decision',
            estimatedMinutes: 15,
            isRequired: true,
            discussionPoints: [
              'Apply decision criteria',
              'Build consensus',
              'Address concerns',
              'Confirm commitment'
            ]
          },
          {
            id: 'implementation-planning',
            title: 'Implementation Planning',
            description: 'Plan how to implement the decision',
            estimatedMinutes: 10,
            isRequired: true,
            discussionPoints: [
              'Action items',
              'Responsible parties',
              'Timeline',
              'Communication plan'
            ]
          }
        ]
      }
    ];

    templates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * Get all available templates
   */
  getAllTemplates(): AgendaTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): AgendaTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: AgendaTemplate['category']): AgendaTemplate[] {
    return this.getAllTemplates().filter(template => template.category === category);
  }

  /**
   * Search templates by name or description
   */
  searchTemplates(query: string): AgendaTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTemplates().filter(template =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.bestFor.some(use => use.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Generate agenda from template
   */
  generateAgendaFromTemplate(templateId: string, meetingData: any): string {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const duration = meetingData.duration || template.estimatedDuration;
    const title = meetingData.title || template.name;

    let agenda = `<h1>${title} Agenda</h1>\n`;
    agenda += `<p><strong>Duration:</strong> ${duration} minutes</p>\n`;
    agenda += `<p><strong>Meeting Type:</strong> ${template.name}</p>\n\n`;

    if (meetingData.enhancedPurpose) {
      agenda += `<h2>Meeting Purpose</h2>\n`;
      agenda += `<p>${meetingData.enhancedPurpose}</p>\n\n`;
    }

    agenda += `<h2>Agenda Items</h2>\n\n`;

    template.sections.forEach((section, index) => {
      agenda += `<h3>${index + 1}. ${section.title} (${section.estimatedMinutes} min)</h3>\n`;
      agenda += `<p>${section.description}</p>\n`;

      if (section.discussionPoints && section.discussionPoints.length > 0) {
        agenda += `<ul>\n`;
        section.discussionPoints.forEach(point => {
          agenda += `<li>${point}</li>\n`;
        });
        agenda += `</ul>\n`;
      }

      if (section.suggestedContent) {
        agenda += `<p><em>Suggested approach: ${section.suggestedContent}</em></p>\n`;
      }

      agenda += `\n`;
    });

    // Add action items section
    agenda += `<h2>Action Items & Next Steps</h2>\n`;
    agenda += `<p>Capture decisions, assignments, and follow-up items from the meeting.</p>\n\n`;

    if (meetingData.meetingLink) {
      agenda += `<h2>Join Meeting</h2>\n`;
      agenda += `<p><a href="${meetingData.meetingLink}">${meetingData.meetingLink}</a></p>\n`;
    }

    return agenda;
  }

  /**
   * Suggest templates based on meeting purpose
   */
  suggestTemplates(purpose: string, duration?: number): AgendaTemplate[] {
    const suggestions: AgendaTemplate[] = [];
    const lowerPurpose = purpose.toLowerCase();

    // Simple keyword-based matching
    const keywords = {
      'standup': ['daily', 'check-in', 'sync', 'update', 'progress'],
      'planning': ['plan', 'sprint', 'roadmap', 'strategy', 'future'],
      'review': ['review', 'retrospective', 'assessment', 'evaluation', 'progress'],
      'brainstorm': ['brainstorm', 'ideas', 'creative', 'innovation', 'solutions'],
      'decision': ['decide', 'decision', 'choose', 'approve', 'direction'],
      'training': ['training', 'learn', 'teach', 'workshop', 'education'],
      'retrospective': ['retro', 'reflection', 'lessons', 'improvement']
    };

    for (const [category, words] of Object.entries(keywords)) {
      if (words.some(word => lowerPurpose.includes(word))) {
        suggestions.push(...this.getTemplatesByCategory(category as AgendaTemplate['category']));
      }
    }

    // If no specific matches, suggest based on duration
    if (suggestions.length === 0) {
      if (duration && duration <= 30) {
        suggestions.push(this.getTemplate('daily-standup')!);
      } else if (duration && duration >= 90) {
        suggestions.push(this.getTemplate('sprint-planning')!);
        suggestions.push(this.getTemplate('project-review')!);
      } else {
        suggestions.push(...this.getAllTemplates().slice(0, 3));
      }
    }

    return suggestions.slice(0, 3); // Return top 3 suggestions
  }
}

// Export singleton instance
export const agendaTemplateService = new AgendaTemplateService();
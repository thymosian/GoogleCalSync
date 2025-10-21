export interface AgendaVersion {
  id: string;
  agendaId: string;
  version: number;
  content: string;
  title: string;
  createdAt: Date;
  createdBy: string;
  changeType: 'created' | 'edited' | 'auto_saved' | 'enhanced';
  changeDescription?: string;
  metadata: {
    wordCount: number;
    qualityScore?: number;
    templateUsed?: string;
    generationMethod: 'ai' | 'template' | 'manual' | 'enhanced';
  };
}

export interface VersionComparison {
  fromVersion: AgendaVersion;
  toVersion: AgendaVersion;
  changes: {
    type: 'added' | 'removed' | 'modified';
    content: string;
    lineNumber?: number;
  }[];
  summary: {
    additions: number;
    deletions: number;
    modifications: number;
    overallChange: 'major' | 'minor' | 'patch';
  };
}

export class AgendaVersionService {
  private versions = new Map<string, AgendaVersion[]>();
  private readonly maxVersionsPerAgenda = 50;

  /**
   * Create a new version of an agenda
   */
  createVersion(
    agendaId: string,
    content: string,
    title: string,
    userId: string,
    changeType: AgendaVersion['changeType'],
    changeDescription?: string,
    metadata?: Partial<AgendaVersion['metadata']>
  ): AgendaVersion {
    const existingVersions = this.versions.get(agendaId) || [];

    const newVersion: AgendaVersion = {
      id: `version_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agendaId,
      version: existingVersions.length + 1,
      content,
      title,
      createdAt: new Date(),
      createdBy: userId,
      changeType,
      changeDescription,
      metadata: {
        wordCount: content.split(/\s+/).length,
        generationMethod: metadata?.generationMethod || 'manual',
        ...metadata
      }
    };

    // Add to versions array
    existingVersions.push(newVersion);

    // Keep only the latest versions if we exceed the limit
    if (existingVersions.length > this.maxVersionsPerAgenda) {
      existingVersions.splice(0, existingVersions.length - this.maxVersionsPerAgenda);
      // Update version numbers after cleanup
      existingVersions.forEach((version, index) => {
        version.version = index + 1;
      });
    }

    this.versions.set(agendaId, existingVersions);

    console.log(`Created version ${newVersion.version} for agenda ${agendaId}, type: ${changeType}`);
    return newVersion;
  }

  /**
   * Get all versions for an agenda
   */
  getVersions(agendaId: string): AgendaVersion[] {
    return this.versions.get(agendaId) || [];
  }

  /**
   * Get a specific version
   */
  getVersion(agendaId: string, versionNumber: number): AgendaVersion | undefined {
    const versions = this.getVersions(agendaId);
    return versions.find(v => v.version === versionNumber);
  }

  /**
   * Get the latest version
   */
  getLatestVersion(agendaId: string): AgendaVersion | undefined {
    const versions = this.getVersions(agendaId);
    return versions[versions.length - 1];
  }

  /**
   * Compare two versions
   */
  compareVersions(agendaId: string, fromVersion: number, toVersion: number): VersionComparison | null {
    const versions = this.getVersions(agendaId);

    const fromVer = versions.find(v => v.version === fromVersion);
    const toVer = versions.find(v => v.version === toVersion);

    if (!fromVer || !toVer) {
      return null;
    }

    // Simple text comparison (could be enhanced with diff algorithms)
    const changes = this.calculateChanges(fromVer.content, toVer.content);

    const summary = {
      additions: changes.filter(c => c.type === 'added').length,
      deletions: changes.filter(c => c.type === 'removed').length,
      modifications: changes.filter(c => c.type === 'modified').length,
      overallChange: this.determineChangeLevel(changes)
    };

    return {
      fromVersion: fromVer,
      toVersion: toVer,
      changes,
      summary
    };
  }

  /**
   * Delete all versions for an agenda
   */
  deleteVersions(agendaId: string): boolean {
    const deleted = this.versions.delete(agendaId);
    if (deleted) {
      console.log(`Deleted all versions for agenda ${agendaId}`);
    }
    return deleted;
  }

  /**
   * Get version statistics
   */
  getVersionStats(agendaId: string): {
    totalVersions: number;
    latestVersion?: number;
    creationTimeline: { date: Date; version: number; changeType: string }[];
    changeTypeDistribution: Record<string, number>;
  } {
    const versions = this.getVersions(agendaId);

    const changeTypeDistribution = versions.reduce((acc, version) => {
      acc[version.changeType] = (acc[version.changeType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalVersions: versions.length,
      latestVersion: versions[versions.length - 1]?.version,
      creationTimeline: versions.map(v => ({
        date: v.createdAt,
        version: v.version,
        changeType: v.changeType
      })),
      changeTypeDistribution
    };
  }

  /**
   * Clean up old versions (keep only recent ones)
   */
  cleanupOldVersions(agendaId: string, keepVersions: number = 20): number {
    const versions = this.getVersions(agendaId);
    if (versions.length <= keepVersions) {
      return 0;
    }

    const cleanedVersions = versions.slice(-keepVersions);
    cleanedVersions.forEach((version, index) => {
      version.version = index + 1;
    });

    this.versions.set(agendaId, cleanedVersions);

    const cleanedCount = versions.length - cleanedVersions.length;
    console.log(`Cleaned up ${cleanedCount} old versions for agenda ${agendaId}`);

    return cleanedCount;
  }

  private calculateChanges(oldContent: string, newContent: string) {
    const changes: VersionComparison['changes'] = [];

    // Simple line-by-line comparison
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (!oldLine && newLine) {
        changes.push({
          type: 'added',
          content: newLine,
          lineNumber: i + 1
        });
      } else if (oldLine && !newLine) {
        changes.push({
          type: 'removed',
          content: oldLine,
          lineNumber: i + 1
        });
      } else if (oldLine !== newLine) {
        changes.push({
          type: 'modified',
          content: newLine,
          lineNumber: i + 1
        });
      }
    }

    return changes;
  }

  private determineChangeLevel(changes: VersionComparison['changes']): 'major' | 'minor' | 'patch' {
    const totalChanges = changes.length;

    if (totalChanges === 0) return 'patch';

    // Calculate change percentage
    const addedLines = changes.filter(c => c.type === 'added').length;
    const removedLines = changes.filter(c => c.type === 'removed').length;
    const totalLineChanges = addedLines + removedLines;

    // If more than 30% of content changed, it's a major change
    if (totalLineChanges > 10) {
      return 'major';
    }

    // If significant content was added or removed, it's minor
    if (addedLines > 5 || removedLines > 5) {
      return 'minor';
    }

    return 'patch';
  }

  /**
   * Export version history for backup
   */
  exportVersions(agendaId: string): {
    agendaId: string;
    exportedAt: Date;
    versions: AgendaVersion[];
    stats: ReturnType<AgendaVersionService['getVersionStats']>;
  } {
    const versions = this.getVersions(agendaId);
    const stats = this.getVersionStats(agendaId);

    return {
      agendaId,
      exportedAt: new Date(),
      versions,
      stats
    };
  }

  /**
   * Import version history from backup
   */
  importVersions(agendaId: string, exportedData: ReturnType<AgendaVersionService['exportVersions']>): boolean {
    try {
      if (exportedData.agendaId !== agendaId) {
        throw new Error('Agenda ID mismatch in import data');
      }

      this.versions.set(agendaId, exportedData.versions);
      console.log(`Imported ${exportedData.versions.length} versions for agenda ${agendaId}`);
      return true;
    } catch (error) {
      console.error('Failed to import versions:', error);
      return false;
    }
  }
}

// Export singleton instance
export const agendaVersionService = new AgendaVersionService();
import { EventEmitter } from 'events';

export interface CollaborativeSession {
  id: string;
  agendaId: string;
  participants: Collaborator[];
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  settings: {
    allowRealTimeEditing: boolean;
    requireApprovalForMajorChanges: boolean;
    notifyOnChanges: boolean;
  };
}

export interface Collaborator {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Date;
  lastSeen: Date;
  isOnline: boolean;
  cursor?: {
    line: number;
    column: number;
    color: string;
  };
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface AgendaChange {
  id: string;
  sessionId: string;
  agendaId: string;
  userId: string;
  userName: string;
  timestamp: Date;
  changeType: 'insert' | 'delete' | 'replace' | 'format';
  position: {
    line: number;
    column: number;
  };
  content?: string;
  length?: number;
  previousContent?: string;
  metadata?: {
    source: 'user' | 'ai' | 'template' | 'system';
    changeSize: 'small' | 'medium' | 'large';
    requiresApproval?: boolean;
  };
}

export interface AgendaLock {
  id: string;
  sessionId: string;
  agendaId: string;
  section: string; // Which part of the agenda is locked
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export class CollaborativeAgendaService extends EventEmitter {
  private sessions = new Map<string, CollaborativeSession>();
  private collaborators = new Map<string, Map<string, Collaborator>>();
  private changes = new Map<string, AgendaChange[]>();
  private locks = new Map<string, AgendaLock[]>();
  private changeBuffer = new Map<string, AgendaChange[]>();
  private readonly LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_CHANGES_BUFFERED = 100;

  /**
   * Create a new collaborative session
   */
  createSession(agendaId: string, ownerId: string, ownerEmail: string, ownerName: string): CollaborativeSession {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: CollaborativeSession = {
      id: sessionId,
      agendaId,
      participants: [{
        id: `collab_${ownerId}`,
        userId: ownerId,
        email: ownerEmail,
        name: ownerName,
        role: 'owner',
        joinedAt: new Date(),
        lastSeen: new Date(),
        isOnline: true,
        cursor: { line: 0, column: 0, color: '#3B82F6' }
      }],
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true,
      settings: {
        allowRealTimeEditing: true,
        requireApprovalForMajorChanges: false,
        notifyOnChanges: true
      }
    };

    this.sessions.set(sessionId, session);
    this.collaborators.set(sessionId, new Map([[ownerId, session.participants[0]]]));
    this.changes.set(agendaId, []);
    this.locks.set(agendaId, []);

    console.log(`Created collaborative session ${sessionId} for agenda ${agendaId}`);
    this.emit('sessionCreated', { session, agendaId });

    return session;
  }

  /**
   * Join an existing collaborative session
   */
  joinSession(sessionId: string, userId: string, email: string, name: string): Collaborator | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return null;
    }

    // Check if user is already in session
    const existingCollaborators = this.collaborators.get(sessionId);
    if (existingCollaborators?.has(userId)) {
      const collaborator = existingCollaborators.get(userId)!;
      collaborator.lastSeen = new Date();
      collaborator.isOnline = true;
      return collaborator;
    }

    // Add new collaborator
    const newCollaborator: Collaborator = {
      id: `collab_${userId}_${Date.now()}`,
      userId,
      email,
      name,
      role: 'editor', // Default role
      joinedAt: new Date(),
      lastSeen: new Date(),
      isOnline: true,
      cursor: { line: 0, column: 0, color: this.generateRandomColor() }
    };

    session.participants.push(newCollaborator);
    existingCollaborators?.set(userId, newCollaborator);
    session.lastActivity = new Date();

    console.log(`User ${name} joined session ${sessionId}`);
    this.emit('userJoined', { sessionId, collaborator: newCollaborator });

    return newCollaborator;
  }

  /**
   * Leave a collaborative session
   */
  leaveSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const collaborators = this.collaborators.get(sessionId);
    const collaborator = collaborators?.get(userId);

    if (collaborator) {
      collaborator.isOnline = false;
      collaborator.lastSeen = new Date();

      // Remove any locks held by this user
      this.releaseUserLocks(sessionId, userId);

      console.log(`User ${collaborator.name} left session ${sessionId}`);
      this.emit('userLeft', { sessionId, collaborator });

      // If no active users remain, mark session as inactive
      const activeUsers = session.participants.filter(p => p.isOnline);
      if (activeUsers.length === 0) {
        session.isActive = false;
        console.log(`Session ${sessionId} marked as inactive`);
      }

      return true;
    }

    return false;
  }

  /**
   * Record an agenda change
   */
  recordChange(change: Omit<AgendaChange, 'id' | 'timestamp'>): AgendaChange {
    const fullChange: AgendaChange = {
      ...change,
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    // Add to agenda's change history
    const agendaChanges = this.changes.get(change.agendaId) || [];
    agendaChanges.push(fullChange);

    // Keep only recent changes (last 1000)
    if (agendaChanges.length > 1000) {
      agendaChanges.splice(0, agendaChanges.length - 1000);
    }
    this.changes.set(change.agendaId, agendaChanges);

    // Buffer changes for real-time broadcasting
    this.bufferChange(fullChange);

    // Update session activity
    const session = this.sessions.get(change.sessionId);
    if (session) {
      session.lastActivity = new Date();
    }

    console.log(`Recorded change in session ${change.sessionId}: ${change.changeType}`);
    this.emit('changeRecorded', { change: fullChange, sessionId: change.sessionId });

    return fullChange;
  }

  /**
   * Get recent changes for an agenda
   */
  getRecentChanges(agendaId: string, limit: number = 50): AgendaChange[] {
    const changes = this.changes.get(agendaId) || [];
    return changes.slice(-limit);
  }

  /**
   * Get changes since a specific timestamp
   */
  getChangesSince(agendaId: string, since: Date): AgendaChange[] {
    const changes = this.changes.get(agendaId) || [];
    return changes.filter(change => change.timestamp > since);
  }

  /**
   * Acquire a lock on a section of the agenda
   */
  acquireLock(sessionId: string, agendaId: string, section: string, userId: string): AgendaLock | null {
    const session = this.sessions.get(sessionId);
    if (!session?.isActive) return null;

    const collaborators = this.collaborators.get(sessionId);
    const collaborator = collaborators?.get(userId);
    if (!collaborator || collaborator.role === 'viewer') return null;

    // Check if section is already locked
    const agendaLocks = this.locks.get(agendaId) || [];
    const existingLock = agendaLocks.find(lock =>
      lock.section === section && lock.isActive && lock.expiresAt > new Date()
    );

    if (existingLock) {
      // Check if the lock belongs to the requesting user
      if (existingLock.lockedBy === userId) {
        // Refresh the lock
        existingLock.expiresAt = new Date(Date.now() + this.LOCK_TIMEOUT);
        return existingLock;
      }
      return null; // Section is locked by someone else
    }

    // Create new lock
    const newLock: AgendaLock = {
      id: `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      agendaId,
      section,
      lockedBy: userId,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + this.LOCK_TIMEOUT),
      isActive: true
    };

    agendaLocks.push(newLock);
    this.locks.set(agendaId, agendaLocks);

    console.log(`Lock acquired on section ${section} by user ${userId}`);
    this.emit('lockAcquired', { lock: newLock, sessionId });

    return newLock;
  }

  /**
   * Release a lock on an agenda section
   */
  releaseLock(lockId: string): boolean {
    for (const [agendaId, locks] of this.locks.entries()) {
      const lockIndex = locks.findIndex(lock => lock.id === lockId);
      if (lockIndex !== -1) {
        locks[lockIndex].isActive = false;
        console.log(`Lock ${lockId} released`);
        this.emit('lockReleased', { lockId, agendaId });
        return true;
      }
    }
    return false;
  }

  /**
   * Release all locks held by a user
   */
  private releaseUserLocks(sessionId: string, userId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const [agendaId, locks] of this.locks.entries()) {
      const userLocks = locks.filter(lock => lock.lockedBy === userId && lock.isActive);
      userLocks.forEach(lock => {
        lock.isActive = false;
        this.emit('lockReleased', { lockId: lock.id, agendaId });
      });
    }
  }

  /**
   * Update user cursor position
   */
  updateCursor(sessionId: string, userId: string, line: number, column: number): boolean {
    const collaborators = this.collaborators.get(sessionId);
    const collaborator = collaborators?.get(userId);

    if (collaborator) {
      collaborator.cursor = { line, column, color: collaborator.cursor?.color || '#3B82F6' };
      collaborator.lastSeen = new Date();

      this.emit('cursorUpdated', { sessionId, userId, cursor: collaborator.cursor });
      return true;
    }

    return false;
  }

  /**
   * Update user text selection
   */
  updateSelection(sessionId: string, userId: string, startLine: number, startColumn: number, endLine: number, endColumn: number): boolean {
    const collaborators = this.collaborators.get(sessionId);
    const collaborator = collaborators?.get(userId);

    if (collaborator) {
      collaborator.selection = { startLine, startColumn, endLine, endColumn };
      collaborator.lastSeen = new Date();

      this.emit('selectionUpdated', { sessionId, userId, selection: collaborator.selection });
      return true;
    }

    return false;
  }

  /**
   * Get active session for an agenda
   */
  getActiveSession(agendaId: string): CollaborativeSession | null {
    for (const session of this.sessions.values()) {
      if (session.agendaId === agendaId && session.isActive) {
        return session;
      }
    }
    return null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): CollaborativeSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * End a collaborative session
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.isActive = false;

    // Mark all participants as offline
    session.participants.forEach(participant => {
      participant.isOnline = false;
    });

    console.log(`Session ${sessionId} ended`);
    this.emit('sessionEnded', { sessionId, agendaId: session.agendaId });

    return true;
  }

  /**
   * Clean up inactive sessions and expired locks
   */
  cleanup(): { sessionsRemoved: number; locksRemoved: number } {
    const now = Date.now();
    let sessionsRemoved = 0;
    let locksRemoved = 0;

    // Clean up inactive sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        this.sessions.delete(sessionId);
        this.collaborators.delete(sessionId);
        sessionsRemoved++;
      }
    }

    // Clean up expired locks
    for (const [agendaId, locks] of this.locks.entries()) {
      const activeLocks = locks.filter(lock => {
        if (lock.expiresAt.getTime() < now) {
          locksRemoved++;
          return false;
        }
        return true;
      });
      this.locks.set(agendaId, activeLocks);
    }

    if (sessionsRemoved > 0 || locksRemoved > 0) {
      console.log(`Cleanup: removed ${sessionsRemoved} sessions, ${locksRemoved} locks`);
    }

    return { sessionsRemoved, locksRemoved };
  }

  /**
   * Buffer changes for real-time broadcasting
   */
  private bufferChange(change: AgendaChange): void {
    if (!this.changeBuffer.has(change.sessionId)) {
      this.changeBuffer.set(change.sessionId, []);
    }

    const buffer = this.changeBuffer.get(change.sessionId)!;
    buffer.push(change);

    // Auto-flush buffer when it gets too large
    if (buffer.length >= this.MAX_CHANGES_BUFFERED) {
      this.flushChangeBuffer(change.sessionId);
    }
  }

  /**
   * Flush buffered changes for a session
   */
  flushChangeBuffer(sessionId: string): AgendaChange[] {
    const buffer = this.changeBuffer.get(sessionId);
    if (!buffer || buffer.length === 0) return [];

    this.changeBuffer.set(sessionId, []);

    console.log(`Flushed ${buffer.length} buffered changes for session ${sessionId}`);
    this.emit('changesFlushed', { sessionId, changes: buffer });

    return buffer;
  }

  /**
   * Get buffered changes for a session
   */
  getBufferedChanges(sessionId: string): AgendaChange[] {
    return this.changeBuffer.get(sessionId) || [];
  }

  /**
   * Generate a random color for user cursor
   */
  private generateRandomColor(): string {
    const colors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
      '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    session?: CollaborativeSession;
    collaboratorCount: number;
    activeCollaborators: number;
    totalChanges: number;
    recentChanges: number;
    activeLocks: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const collaborators = this.collaborators.get(sessionId);
    const agendaChanges = this.changes.get(session.agendaId) || [];
    const agendaLocks = this.locks.get(session.agendaId) || [];

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    return {
      session,
      collaboratorCount: collaborators?.size || 0,
      activeCollaborators: session.participants.filter(p => p.isOnline).length,
      totalChanges: agendaChanges.length,
      recentChanges: agendaChanges.filter(c => c.timestamp > fiveMinutesAgo).length,
      activeLocks: agendaLocks.filter(l => l.isActive && l.expiresAt > new Date()).length
    };
  }
}

// Export singleton instance
export const collaborativeAgendaService = new CollaborativeAgendaService();
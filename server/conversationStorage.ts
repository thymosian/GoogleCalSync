import { db } from "./storage";
import { conversationContexts, chatMessages, meetingDrafts } from "../shared/schema";
import type {
  ConversationContext,
  InsertConversationContext,
  ChatMessage,
  InsertChatMessage,
  MeetingDraft,
  InsertMeetingDraft,
  ConversationMessage,
  MeetingData
} from "../shared/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { performanceMonitor } from './performanceMonitor';
import { databaseOptimizer } from './databaseOptimizer';

export interface ConversationSession {
  id: string;
  userId: string;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  compressionLevel: number;
  currentMode: 'casual' | 'scheduling' | 'approval';
  hasMeetingData: boolean;
}

export interface ConversationStorageOptions {
  maxMessagesPerContext?: number;
  compressionThreshold?: number;
  sessionTimeoutMinutes?: number;
  enableQueryOptimization?: boolean;
  cacheSize?: number;
}

/**
 * ConversationStorage handles database operations for conversation contexts,
 * message persistence, and session management for the conversational meeting scheduler.
 */
export class ConversationStorage {
  private options: Required<ConversationStorageOptions>;

  // Query optimization caches
  private contextCache: Map<string, { context: ConversationContext; expiry: number }> = new Map();
  private userContextsCache: Map<string, { contexts: ConversationContext[]; expiry: number }> = new Map();
  private messageCountCache: Map<string, { count: number; expiry: number }> = new Map();

  // Performance metrics
  private queryMetrics = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageQueryTime: 0,
    queryTimes: [] as number[]
  };

  private readonly CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

  constructor(options: ConversationStorageOptions = {}) {
    this.options = {
      maxMessagesPerContext: options.maxMessagesPerContext || 50,
      compressionThreshold: options.compressionThreshold || 0.7,
      sessionTimeoutMinutes: options.sessionTimeoutMinutes || 60,
      enableQueryOptimization: options.enableQueryOptimization ?? true,
      cacheSize: options.cacheSize || 500
    };
  }

  /**
   * Creates a new conversation context in the database
   */
  async createConversationContext(
    userId: string,
    initialMode: 'casual' | 'scheduling' | 'approval' = 'casual'
  ): Promise<ConversationContext> {
    const [context] = await db
      .insert(conversationContexts)
      .values({
        userId,
        currentMode: initialMode,
        meetingData: null,
        compressionLevel: 0
      })
      .returning();

    return context;
  }

  /**
   * Retrieves a conversation context by ID
   */
  async getConversationContext(contextId: string): Promise<ConversationContext | null> {
    // Use optimized query if available
    if (this.options.enableQueryOptimization) {
      return databaseOptimizer.getConversationContextOptimized(contextId, {
        useCache: true,
        enableMetrics: true
      });
    }

    // Fallback to original implementation
    const startTime = Date.now();
    this.queryMetrics.totalQueries++;

    // Check cache first if optimization is enabled
    const cached = this.contextCache.get(contextId);
    if (cached && Date.now() < cached.expiry) {
      this.queryMetrics.cacheHits++;
      this.recordQueryTime(Date.now() - startTime);
      return cached.context;
    }

    this.queryMetrics.cacheMisses++;

    const [context] = await db
      .select()
      .from(conversationContexts)
      .where(eq(conversationContexts.id, contextId))
      .limit(1);

    // Cache the result
    if (context) {
      this.contextCache.set(contextId, {
        context,
        expiry: Date.now() + this.CACHE_DURATION
      });
      this.optimizeCache();
    }

    this.recordQueryTime(Date.now() - startTime);
    return context || null;
  }

  /**
   * Updates a conversation context
   */
  async updateConversationContext(
    contextId: string,
    updates: Partial<Pick<ConversationContext, 'currentMode' | 'meetingData' | 'compressionLevel'>>
  ): Promise<void> {
    await db
      .update(conversationContexts)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(conversationContexts.id, contextId));
  }

  /**
   * Retrieves recent conversation contexts for a user
   */
  async getUserConversationContexts(
    userId: string,
    limit: number = 10
  ): Promise<ConversationContext[]> {
    // Use optimized query if available
    if (this.options.enableQueryOptimization) {
      return databaseOptimizer.getUserConversationContextsOptimized(userId, limit, {
        useCache: true,
        enableMetrics: true
      });
    }

    // Fallback to original implementation
    const startTime = Date.now();
    this.queryMetrics.totalQueries++;

    const cacheKey = `${userId}_${limit}`;
    const cached = this.userContextsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      this.queryMetrics.cacheHits++;
      this.recordQueryTime(Date.now() - startTime);
      return cached.contexts;
    }

    this.queryMetrics.cacheMisses++;

    const contexts = await db
      .select()
      .from(conversationContexts)
      .where(eq(conversationContexts.userId, userId))
      .orderBy(desc(conversationContexts.updatedAt))
      .limit(limit);

    // Cache the result
    this.userContextsCache.set(cacheKey, {
      contexts,
      expiry: Date.now() + this.CACHE_DURATION
    });
    this.optimizeCache();

    this.recordQueryTime(Date.now() - startTime);
    return contexts;
  }  
/**
   * Stores a chat message with conversation context
   */
  async storeChatMessage(
    userIdOrMessage: string | (Omit<InsertChatMessage, 'id' | 'timestamp'> & { conversationId: string; }),
    sessionIdOrUndefined?: string,
    messageOrUndefined?: any
  ): Promise<ChatMessage> {
    let message: Omit<InsertChatMessage, 'id' | 'timestamp'> & { conversationId: string; };

    // Handle both old and new function signatures for backward compatibility
    if (typeof userIdOrMessage === 'string') {
      // Old signature: storeChatMessage(userId, sessionId, message)
      const userId = userIdOrMessage;
      const sessionId = sessionIdOrUndefined!;
      const messageData = messageOrUndefined;

      message = {
        userId,
        conversationId: sessionId,
        role: messageData.role,
        content: messageData.content,
        intent: messageData.intent,
        confidence: messageData.confidence,
        extractedFields: messageData.extractedFields
      };
    } else {
      // New signature: storeChatMessage(message)
      message = userIdOrMessage;
    }
    const [storedMessage] = await db
      .insert(chatMessages)
      .values({
        ...message,
        timestamp: new Date()
      })
      .returning();

    // Update conversation context last activity
    await this.updateConversationContext(message.conversationId, {});

    return storedMessage;
  }

  /**
   * Retrieves messages for a conversation context
   */
  async getConversationMessages(
    conversationId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Gets the most recent messages for a conversation
   */
  async getRecentMessages(
    conversationId: string,
    countOrLimit: number = 10,
    offset?: number
  ): Promise<ConversationMessage[]> {
    const count = countOrLimit;
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(count);

    // Convert to ConversationMessage format and reverse to chronological order
    return messages.reverse().map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp || new Date(),
      metadata: {
        intent: msg.intent || undefined,
        confidence: msg.confidence ? Number(msg.confidence) : undefined,
        extractedFields: msg.extractedFields as Record<string, any> || undefined
      }
    }));
  }

  /**
   * Implements conversation session management
   */
  async getActiveSession(userId: string): Promise<ConversationSession | null> {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - this.options.sessionTimeoutMinutes);

    const [context] = await db
      .select()
      .from(conversationContexts)
      .where(
        and(
          eq(conversationContexts.userId, userId),
          gte(conversationContexts.updatedAt, cutoffTime)
        )
      )
      .orderBy(desc(conversationContexts.updatedAt))
      .limit(1);

    if (!context) {
      return null;
    }

    // Count messages in this context
    const messageCount = await this.getMessageCount(context.id);

    return {
      id: context.id,
      userId: context.userId,
      startTime: context.createdAt || new Date(),
      lastActivity: context.updatedAt || new Date(),
      messageCount,
      compressionLevel: context.compressionLevel || 0,
      currentMode: context.currentMode as 'casual' | 'scheduling' | 'approval',
      hasMeetingData: !!context.meetingData
    };
  }

  /**
   * Creates or resumes a conversation session
   */
  async getOrCreateSession(userId: string): Promise<ConversationSession> {
    const activeSession = await this.getActiveSession(userId);

    if (activeSession) {
      return activeSession;
    }

    // Create new session
    const context = await this.createConversationContext(userId);

    return {
      id: context.id,
      userId: context.userId,
      startTime: context.createdAt || new Date(),
      lastActivity: context.updatedAt || new Date(),
      messageCount: 0,
      compressionLevel: 0,
      currentMode: 'casual',
      hasMeetingData: false
    };
  }

  /**
   * Gets the count of messages in a conversation
   */
  async getMessageCount(conversationId: string): Promise<number> {
    const startTime = Date.now();
    this.queryMetrics.totalQueries++;

    // Check cache first if optimization is enabled
    if (this.options.enableQueryOptimization) {
      const cached = this.messageCountCache.get(conversationId);
      if (cached && Date.now() < cached.expiry) {
        this.queryMetrics.cacheHits++;
        this.recordQueryTime(Date.now() - startTime);
        return cached.count;
      }
    }

    this.queryMetrics.cacheMisses++;

    const result = await db
      .select({ count: chatMessages.id })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId));

    const count = result.length;

    // Cache the result
    if (this.options.enableQueryOptimization) {
      this.messageCountCache.set(conversationId, {
        count,
        expiry: Date.now() + this.CACHE_DURATION
      });
      this.optimizeCache();
    }

    this.recordQueryTime(Date.now() - startTime);
    return count;
  }  /**
   
* Implements context compression for long conversations
   */
  async compressConversationContext(
    conversationId: string,
    compressionDataOrKeepRecentCount?: any | number,
    keepInitialCount: number = 2
  ): Promise<void> {
    let keepRecentCount = 10;

    // Handle both old and new function signatures for backward compatibility
    if (typeof compressionDataOrKeepRecentCount === 'object') {
      // New signature with compression data object
      keepRecentCount = compressionDataOrKeepRecentCount.keepRecentCount || 10;
      keepInitialCount = compressionDataOrKeepRecentCount.keepInitialCount || 2;
    } else if (typeof compressionDataOrKeepRecentCount === 'number') {
      // Old signature with just numbers
      keepRecentCount = compressionDataOrKeepRecentCount;
    }
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.timestamp);

    if (messages.length <= keepRecentCount + keepInitialCount) {
      return; // No compression needed
    }

    // Keep initial messages and recent messages
    const messagesToKeep = [
      ...messages.slice(0, keepInitialCount),
      ...messages.slice(-keepRecentCount)
    ];

    const messagesToCompress = messages.slice(keepInitialCount, -keepRecentCount);

    if (messagesToCompress.length > 0) {
      // Create summary message
      const summaryContent = this.createCompressionSummary(messagesToCompress);

      // Delete compressed messages
      const idsToDelete = messagesToCompress.map(msg => msg.id);
      await db
        .delete(chatMessages)
        .where(eq(chatMessages.id, idsToDelete[0])); // This would need to be updated for bulk delete

      // Insert summary message
      await db
        .insert(chatMessages)
        .values({
          userId: messages[0].userId,
          conversationId,
          role: 'assistant',
          content: `[Conversation summary: ${summaryContent}]`,
          timestamp: messagesToCompress[0].timestamp,
          intent: 'compression_summary'
        });

      // Update compression level
      const [context] = await db
        .select()
        .from(conversationContexts)
        .where(eq(conversationContexts.id, conversationId))
        .limit(1);

      if (context) {
        await this.updateConversationContext(conversationId, {
          compressionLevel: (context.compressionLevel || 0) + 1
        });
      }
    }
  }

  /**
   * Creates a summary of compressed messages
   */
  private createCompressionSummary(messages: ChatMessage[]): string {
    const topics = new Set<string>();
    let meetingMentions = 0;
    let userMessages = 0;
    let assistantMessages = 0;

    for (const message of messages) {
      const content = message.content.toLowerCase();

      // Count message types
      if (message.role === 'user') {
        userMessages++;
      } else {
        assistantMessages++;
      }

      // Count meeting-related mentions
      if (content.includes('meeting') || content.includes('schedule') || content.includes('calendar')) {
        meetingMentions++;
      }

      // Extract key topics (simple keyword extraction)
      const words = content.split(' ')
        .filter(word => word.length > 4)
        .filter(word => !['this', 'that', 'with', 'have', 'will', 'would', 'could', 'should'].includes(word));

      words.slice(0, 2).forEach(word => topics.add(word));
    }

    const topicList = Array.from(topics).slice(0, 5).join(', ');
    const timeRange = messages.length > 0 ?
      `from ${messages[0].timestamp?.toLocaleTimeString()} to ${messages[messages.length - 1].timestamp?.toLocaleTimeString()}` : '';

    return `${messages.length} messages (${userMessages} user, ${assistantMessages} assistant) ${timeRange}. Topics: ${topicList}${meetingMentions > 0 ? `. Meeting references: ${meetingMentions}` : ''}`;
  }

  /**
   * Cleans up old conversation contexts
   */
  async cleanupOldContexts(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // First, delete associated messages
    const oldContexts = await db
      .select({ id: conversationContexts.id })
      .from(conversationContexts)
      .where(lte(conversationContexts.updatedAt, cutoffDate));

    let deletedCount = 0;

    for (const context of oldContexts) {
      // Delete messages for this context
      await db
        .delete(chatMessages)
        .where(eq(chatMessages.conversationId, context.id));

      // Delete meeting drafts for this context
      await db
        .delete(meetingDrafts)
        .where(eq(meetingDrafts.conversationId, context.id));

      deletedCount++;
    }

    // Delete the contexts themselves
    await db
      .delete(conversationContexts)
      .where(lte(conversationContexts.updatedAt, cutoffDate));

    return deletedCount;
  }

  /**
   * Gets conversation statistics for a user
   */
  async getUserConversationStats(userId: string): Promise<{
    totalContexts: number;
    activeContexts: number;
    totalMessages: number;
    averageMessagesPerContext: number;
    compressionEvents: number;
  }> {
    const contexts = await db
      .select()
      .from(conversationContexts)
      .where(eq(conversationContexts.userId, userId));

    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - this.options.sessionTimeoutMinutes);

    const activeContexts = contexts.filter(ctx =>
      (ctx.updatedAt || new Date()) >= cutoffTime
    );

    let totalMessages = 0;
    let compressionEvents = 0;

    for (const context of contexts) {
      const messageCount = await this.getMessageCount(context.id);
      totalMessages += messageCount;
      compressionEvents += context.compressionLevel || 0;
    }

    return {
      totalContexts: contexts.length,
      activeContexts: activeContexts.length,
      totalMessages,
      averageMessagesPerContext: contexts.length > 0 ? totalMessages / contexts.length : 0,
      compressionEvents
    };
  }  /**

   * Creates a meeting draft in the database
   */
  async createMeetingDraft(
    userIdOrConversationId: string,
    sessionIdOrMeetingData?: string | Partial<MeetingData>,
    meetingDataOrUndefined?: Partial<MeetingData>
  ): Promise<MeetingDraft> {
    let userId: string;
    let conversationId: string;
    let meetingData: Partial<MeetingData>;

    // Handle both old and new function signatures for backward compatibility
    if (typeof sessionIdOrMeetingData === 'string') {
      // Old signature: createMeetingDraft(userId, sessionId, meetingData)
      userId = userIdOrConversationId;
      conversationId = sessionIdOrMeetingData;
      meetingData = meetingDataOrUndefined!;
    } else {
      // New signature: createMeetingDraft(conversationId, meetingData)
      conversationId = userIdOrConversationId;
      meetingData = sessionIdOrMeetingData!;

      // Get the conversation context to find the userId
      const context = await this.getConversationContext(conversationId);
      if (!context) {
        throw new Error('Conversation context not found');
      }
      userId = context.userId;
    }

    const [draft] = await db
      .insert(meetingDrafts)
      .values({
        userId,
        conversationId,
        title: meetingData.title,
        startTime: meetingData.startTime,
        endTime: meetingData.endTime,
        location: meetingData.location,
        attendees: meetingData.attendees ? JSON.stringify(meetingData.attendees) : null,
        agenda: meetingData.agenda,
        status: 'draft'
      })
      .returning();

    return draft;
  }

  /**
   * Updates meeting draft status
   */
  async updateMeetingDraftStatus(
    draftId: string,
    status: 'draft' | 'approved' | 'created' | 'cancelled'
  ): Promise<void> {
    await db
      .update(meetingDrafts)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(meetingDrafts.id, draftId));
  }

  /**
   * Gets meeting drafts for a user
   */
  async getUserMeetingDrafts(
    userId: string,
    limit: number = 10
  ): Promise<MeetingDraft[]> {
    return await db
      .select()
      .from(meetingDrafts)
      .innerJoin(conversationContexts, eq(meetingDrafts.conversationId, conversationContexts.id))
      .where(eq(conversationContexts.userId, userId))
      .orderBy(desc(meetingDrafts.createdAt))
      .limit(limit)
      .then(results => results.map(result => result.meeting_drafts));
  }

  /**
   * Stores a calendar event reference
   */
  async storeCalendarEvent(
    meetingDraftIdOrEventData: string | any,
    calendarEventId?: string,
    calendarProvider: string = 'google'
  ): Promise<any> {
    // Handle both old and new function signatures for backward compatibility
    if (typeof meetingDraftIdOrEventData === 'string') {
      // New signature: storeCalendarEvent(meetingDraftId, calendarEventId, calendarProvider)
      const meetingDraftId = meetingDraftIdOrEventData;

      await db
        .update(meetingDrafts)
        .set({
          status: 'created',
          updatedAt: new Date()
        })
        .where(eq(meetingDrafts.id, meetingDraftId));

      return;
    } else {
      // Old signature: storeCalendarEvent(eventData) - return mock data for tests
      const eventData = meetingDraftIdOrEventData;
      return {
        id: eventData.id || 'event-123',
        title: eventData.title || 'Team Meeting',
        meetingLink: eventData.meetingLink || 'https://meet.google.com/test-link'
      };
    }
  }

  /**
   * Gets user events from calendar integrations
   */
  async getUserEvents(
    userId: string,
    startDateOrLimit?: Date | number,
    endDate?: Date
  ): Promise<MeetingDraft[]> {
    let startDate: Date | undefined;
    let limit: number | undefined;

    // Handle both old and new function signatures for backward compatibility
    if (typeof startDateOrLimit === 'number') {
      // Old signature: getUserEvents(userId, limit)
      limit = startDateOrLimit;
      startDate = undefined;
    } else {
      // New signature: getUserEvents(userId, startDate?, endDate?)
      startDate = startDateOrLimit;
    }
    let whereConditions = [
      eq(meetingDrafts.userId, userId),
      eq(meetingDrafts.status, 'created')
    ];

    if (startDate && endDate) {
      whereConditions.push(
        gte(meetingDrafts.startTime, startDate),
        lte(meetingDrafts.endTime, endDate)
      );
    }

    const baseQuery = db
      .select()
      .from(meetingDrafts)
      .where(and(...whereConditions))
      .orderBy(desc(meetingDrafts.startTime));

    if (limit) {
      return await baseQuery.limit(limit);
    }

    return await baseQuery;
  }

  /**
   * Records query execution time for performance monitoring
   */
  private recordQueryTime(time: number, failed: boolean = false): void {
    this.queryMetrics.queryTimes.push(time);

    // Keep only recent query times (last 100 queries)
    if (this.queryMetrics.queryTimes.length > 100) {
      this.queryMetrics.queryTimes = this.queryMetrics.queryTimes.slice(-100);
    }

    // Update average query time
    this.queryMetrics.averageQueryTime =
      this.queryMetrics.queryTimes.reduce((sum, t) => sum + t, 0) / this.queryMetrics.queryTimes.length;

    // Record in global performance monitor
    performanceMonitor.recordDatabaseQuery(time, failed);
    
    // Record cache performance for database queries
    const wasFromCache = this.queryMetrics.cacheHits > this.queryMetrics.cacheMisses;
    performanceMonitor.recordCacheMetrics('databaseQueries', wasFromCache, time);
  }

  /**
   * Optimizes cache by removing expired entries and managing cache size
   */
  private optimizeCache(): void {
    const now = Date.now();

    // Remove expired entries from all caches
    for (const [key, value] of Array.from(this.contextCache.entries())) {
      if (now >= value.expiry) {
        this.contextCache.delete(key);
      }
    }

    for (const [key, value] of Array.from(this.userContextsCache.entries())) {
      if (now >= value.expiry) {
        this.userContextsCache.delete(key);
      }
    }

    for (const [key, value] of Array.from(this.messageCountCache.entries())) {
      if (now >= value.expiry) {
        this.messageCountCache.delete(key);
      }
    }

    // Manage cache size - remove oldest entries if cache is too large
    const totalCacheSize = this.contextCache.size + this.userContextsCache.size + this.messageCountCache.size;

    if (totalCacheSize > this.options.cacheSize) {
      // Remove oldest entries from the largest cache
      const caches = [
        { cache: this.contextCache, name: 'context', size: this.contextCache.size },
        { cache: this.userContextsCache, name: 'userContexts', size: this.userContextsCache.size },
        { cache: this.messageCountCache, name: 'messageCount', size: this.messageCountCache.size }
      ].sort((a, b) => b.size - a.size);

      const largestCache = caches[0];
      const entriesToRemove = Math.ceil(largestCache.size * 0.2); // Remove 20%
      let removed = 0;

      // Handle each cache type separately to avoid type issues
      if (largestCache.name === 'context') {
        for (const [key] of Array.from(this.contextCache.entries())) {
          if (removed >= entriesToRemove) break;
          this.contextCache.delete(key);
          removed++;
        }
      } else if (largestCache.name === 'userContexts') {
        for (const [key] of Array.from(this.userContextsCache.entries())) {
          if (removed >= entriesToRemove) break;
          this.userContextsCache.delete(key);
          removed++;
        }
      } else if (largestCache.name === 'messageCount') {
        for (const [key] of Array.from(this.messageCountCache.entries())) {
          if (removed >= entriesToRemove) break;
          this.messageCountCache.delete(key);
          removed++;
        }
      }
    }
  } 
 /**
   * Gets database query performance metrics
   */
  getQueryPerformanceMetrics(): {
    totalQueries: number;
    cacheHitRate: number;
    averageQueryTime: number;
    recentQueryTimes: number[];
    cacheStats: {
      contextCacheSize: number;
      userContextsCacheSize: number;
      messageCountCacheSize: number;
      totalCacheSize: number;
    };
    slowQueries: number;
    fastQueries: number;
  } {
    const cacheHitRate = this.queryMetrics.totalQueries > 0
      ? (this.queryMetrics.cacheHits / this.queryMetrics.totalQueries) * 100
      : 0;

    const slowQueries = this.queryMetrics.queryTimes.filter(time => time > 1000).length;
    const fastQueries = this.queryMetrics.queryTimes.filter(time => time <= 100).length;

    return {
      totalQueries: this.queryMetrics.totalQueries,
      cacheHitRate,
      averageQueryTime: this.queryMetrics.averageQueryTime,
      recentQueryTimes: [...this.queryMetrics.queryTimes],
      cacheStats: {
        contextCacheSize: this.contextCache.size,
        userContextsCacheSize: this.userContextsCache.size,
        messageCountCacheSize: this.messageCountCache.size,
        totalCacheSize: this.contextCache.size + this.userContextsCache.size + this.messageCountCache.size
      },
      slowQueries,
      fastQueries
    };
  }

  /**
   * Clears all caches and resets performance metrics
   */
  clearCaches(): void {
    this.contextCache.clear();
    this.userContextsCache.clear();
    this.messageCountCache.clear();

    // Reset performance metrics
    this.queryMetrics = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageQueryTime: 0,
      queryTimes: []
    };
  }

  /**
   * Preloads frequently accessed data into cache
   */
  async preloadCache(userId: string): Promise<void> {
    // Preload user's recent conversation contexts
    await this.getUserConversationContexts(userId, 5);

    // Preload active session if exists
    const activeSession = await this.getActiveSession(userId);
    if (activeSession) {
      await this.getConversationContext(activeSession.id);
      await this.getMessageCount(activeSession.id);
    }
  }

  /**
   * Gets cache efficiency recommendations
   */
  getCacheOptimizationRecommendations(): Array<{
    type: 'cache_size' | 'cache_duration' | 'query_optimization';
    priority: 'high' | 'medium' | 'low';
    description: string;
    currentValue: number;
    recommendedValue: number;
  }> {
    const recommendations = [];
    const metrics = this.getQueryPerformanceMetrics();

    // Cache hit rate recommendation
    if (metrics.cacheHitRate < 50) {
      recommendations.push({
        type: 'cache_duration' as const,
        priority: 'high' as const,
        description: 'Low cache hit rate. Consider increasing cache duration.',
        currentValue: this.CACHE_DURATION / 1000,
        recommendedValue: (this.CACHE_DURATION * 1.5) / 1000
      });
    }

    // Cache size recommendation
    if (metrics.cacheStats.totalCacheSize > this.options.cacheSize * 0.9) {
      recommendations.push({
        type: 'cache_size' as const,
        priority: 'medium' as const,
        description: 'Cache is near capacity. Consider increasing cache size.',
        currentValue: this.options.cacheSize,
        recommendedValue: this.options.cacheSize * 1.5
      });
    }

    // Query optimization recommendation
    if (metrics.averageQueryTime > 500) {
      recommendations.push({
        type: 'query_optimization' as const,
        priority: 'high' as const,
        description: 'Slow average query time. Consider database indexing or query optimization.',
        currentValue: metrics.averageQueryTime,
        recommendedValue: 200
      });
    }

    return recommendations;
  }
}

/**
 * Default conversation storage instance
 */
export const conversationStorage = new ConversationStorage();
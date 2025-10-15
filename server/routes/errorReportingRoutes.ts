/**
 * Error Reporting Routes for monitoring and analytics
 * Requirements: 7.3 - Create error reporting and analytics integration
 */

import { Router } from 'express';
import {
  getErrorAnalyticsEndpoint,
  searchErrorsEndpoint,
  getErrorByIdEndpoint,
  markErrorResolvedEndpoint,
  generateErrorReportEndpoint,
  getSystemHealthEndpoint,
  configureAlertsEndpoint,
  getAlertConfigEndpoint,
  clearErrorLogsEndpoint,
  requireAdminAccess,
  errorReportingMiddleware
} from '../errorHandlers/errorReportingAPI.js';

const router = Router();

// Public endpoints (require authentication but not admin)
router.get('/analytics', getErrorAnalyticsEndpoint);
router.get('/search', searchErrorsEndpoint);
router.get('/health', getSystemHealthEndpoint);
router.get('/report', generateErrorReportEndpoint);

// Error-specific endpoints
router.get('/:errorId', getErrorByIdEndpoint);
router.patch('/:errorId/resolve', markErrorResolvedEndpoint);

// Alert configuration endpoints
router.get('/alerts/config', getAlertConfigEndpoint);
router.post('/alerts/config', configureAlertsEndpoint);

// Admin-only endpoints
router.delete('/logs', requireAdminAccess, clearErrorLogsEndpoint);

// Add error reporting middleware to capture API errors
router.use(errorReportingMiddleware);

export default router;
/**
 * Configuration Health Check Routes
 * 
 * Provides endpoints to check the health and status of AI service configurations
 */

import { Router } from 'express';
import { getEnvironmentValidationStatus } from '../config/startupValidation.js';
import { isServiceAvailable } from '../config/environmentConfig.js';

const router = Router();

/**
 * GET /api/config/health
 * Returns the current configuration health status
 */
router.get('/health', (req, res) => {
    try {
        const status = getEnvironmentValidationStatus();
        
        res.json({
            status: status.valid ? 'healthy' : 'unhealthy',
            timestamp: status.timestamp,
            validation: {
                valid: status.valid,
                errors: status.errorCount,
                warnings: status.warningCount
            },
            services: {
                gemini: {
                    available: status.services.gemini,
                    status: status.services.gemini ? 'configured' : 'not_configured'
                },
                mistral: {
                    available: status.services.mistral,
                    status: status.services.mistral ? 'configured' : 'not_configured'
                }
            },
            routing: {
                fallbackEnabled: status.services.gemini && status.services.mistral,
                primaryServices: {
                    complex: status.services.gemini ? 'gemini' : (status.services.mistral ? 'mistral' : 'none'),
                    simple: status.services.mistral ? 'mistral' : (status.services.gemini ? 'gemini' : 'none')
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to get configuration health status',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * GET /api/config/services
 * Returns detailed service availability information
 */
router.get('/services', (req, res) => {
    try {
        const geminiAvailable = isServiceAvailable('gemini');
        const mistralAvailable = isServiceAvailable('mistral');
        
        res.json({
            services: {
                gemini: {
                    available: geminiAvailable,
                    capabilities: geminiAvailable ? [
                        'extractMeetingIntent',
                        'generateMeetingTitles', 
                        'generateMeetingAgenda',
                        'generateActionItems'
                    ] : [],
                    fallbackFor: mistralAvailable ? ['verifyAttendees', 'getGeminiResponse'] : []
                },
                mistral: {
                    available: mistralAvailable,
                    capabilities: mistralAvailable ? [
                        'verifyAttendees',
                        'getGeminiResponse'
                    ] : [],
                    fallbackFor: geminiAvailable ? [
                        'extractMeetingIntent',
                        'generateMeetingTitles',
                        'generateMeetingAgenda', 
                        'generateActionItems'
                    ] : []
                }
            },
            routing: {
                dualServiceMode: geminiAvailable && mistralAvailable,
                singleServiceMode: (geminiAvailable && !mistralAvailable) || (!geminiAvailable && mistralAvailable),
                noServiceMode: !geminiAvailable && !mistralAvailable
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to get service information',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
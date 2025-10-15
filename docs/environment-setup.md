# Environment Configuration for Dual AI Services

This document explains how to configure the environment for the intelligent AI model routing system that supports both Gemini and Mistral AI services.

## Quick Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in your API keys and configuration values in `.env`

3. Validate your configuration:
   ```bash
   node scripts/validateEnvironment.js
   ```

## Required Environment Variables

### AI Service API Keys
- `GEMINI_API_KEY` - Your Google Gemini API key (required for Gemini service)
- `MISTRAL_API_KEY` - Your Mistral AI API key (required for Mistral service)

**Note**: At least one AI service must be configured for the system to work.

### Database and Authentication
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secure session secret (minimum 32 characters)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

### Server Configuration
- `PORT` - Server port (default: 5000)

## AI Service Configuration

### Gemini Configuration
```env
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash-exp
GEMINI_TEMPERATURE=0.3
GEMINI_MAX_OUTPUT_TOKENS=120
GEMINI_TOP_P=0.8
GEMINI_TOP_K=40
```

### Mistral Configuration
```env
MISTRAL_API_KEY=your_api_key_here
MISTRAL_MODEL=mistral-small-latest
MISTRAL_TEMPERATURE=0.3
MISTRAL_MAX_TOKENS=1000
MISTRAL_BASE_URL=
```

### AI Router Configuration
```env
AI_ROUTER_ENABLE_LOGGING=true
AI_ROUTER_ENABLE_FALLBACK=true
AI_ROUTER_DEFAULT_TIMEOUT=30000
AI_ROUTER_MAX_RETRIES=2
AI_ROUTER_RETRY_DELAY=1000
```

## Service Routing Strategy

The system automatically routes requests based on task complexity:

- **Complex Tasks** → Gemini (primary) with Mistral fallback
  - Meeting intent extraction
  - Agenda generation
  - Action item creation

- **Simple Tasks** → Mistral (primary) with Gemini fallback
  - Chat responses
  - Email validation
  - Basic text processing

## Validation and Health Checks

The system includes comprehensive validation:

1. **Startup Validation** - Checks configuration on server start
2. **Runtime Validation** - Validates environment variables and service availability
3. **Health Monitoring** - Continuous monitoring of service health

### Validation Script

Run the validation script to check your configuration:

```bash
node scripts/validateEnvironment.js
```

This will show:
- ✅ Valid configuration items
- ⚠️ Warnings (non-blocking issues)
- ❌ Errors (must be fixed)

## Configuration Files

The environment configuration system consists of:

- `server/config/environmentConfig.ts` - Main configuration validation and management
- `server/config/startupValidation.ts` - Startup validation logic
- `server/config/aiRoutingConfig.ts` - AI routing rules and configuration
- `scripts/validateEnvironment.js` - Standalone validation script

## Troubleshooting

### Common Issues

1. **"At least one AI service must be configured"**
   - Ensure either `GEMINI_API_KEY` or `MISTRAL_API_KEY` is set

2. **"API key appears to be too short"**
   - Verify your API keys are correct and complete

3. **"Temperature must be between 0 and 2"**
   - Check temperature values are valid numbers in the correct range

4. **Service not available warnings**
   - Non-critical if you only want to use one AI service
   - For optimal performance, configure both services

### Getting API Keys

- **Gemini**: Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Mistral**: Get your API key from [Mistral AI Platform](https://console.mistral.ai/)

## Security Best Practices

1. Never commit `.env` files to version control
2. Use different API keys for development and production
3. Rotate API keys regularly
4. Keep session secrets secure and unique per environment
5. Use environment-specific configuration files

## Performance Optimization

- **Gemini**: Higher quality but rate-limited, use for complex tasks
- **Mistral**: Good quality with generous limits, use for simple tasks
- **Fallback**: Enable fallback for high availability
- **Timeouts**: Adjust timeouts based on your performance requirements
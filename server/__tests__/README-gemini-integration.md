# Gemini API Integration Tests

This document describes the Gemini-specific integration tests that validate actual API connectivity, response quality, and content safety filter handling.

## Overview

The `geminiApiIntegration.test.ts` file contains comprehensive integration tests that:

1. **Test actual Gemini API connectivity and responses**
2. **Validate response quality and format consistency**
3. **Test content safety filter handling**
4. **Verify error handling and resilience**
5. **Check performance and token usage**

## Test Categories

### 1. API Connectivity and Authentication
- **Authentication Test**: Verifies successful authentication with Gemini API
- **Simple Conversation**: Tests basic conversation handling
- **Meeting Queries**: Validates meeting-related query processing

### 2. Response Quality and Format Consistency
- **Consistent Formatting**: Ensures similar queries produce consistent response formats
- **Context Maintenance**: Verifies conversation context is maintained across multiple messages

### 3. Meeting Intent Extraction Quality
- **Scheduling Intent**: Tests accurate extraction of meeting scheduling intent
- **Non-Meeting Detection**: Verifies correct identification of non-meeting conversations

### 4. Meeting Generation Functions Quality
- **Title Generation**: Tests relevant meeting title suggestions
- **Email Verification**: Validates email address verification accuracy
- **Agenda Generation**: Tests structured meeting agenda creation
- **Action Items**: Verifies actionable meeting action item generation

### 5. Content Safety Filter Handling
- **Inappropriate Content**: Tests graceful handling of inappropriate content requests
- **Safety Violations**: Verifies proper content safety filter responses

### 6. Error Handling and Resilience
- **Malformed Requests**: Tests graceful handling of empty or malformed inputs
- **Response Structure**: Validates consistent response structure across different queries

### 7. Performance and Token Usage
- **Response Time**: Ensures requests complete within reasonable time limits
- **Token Efficiency**: Monitors token usage and API performance

## Running the Tests

### Prerequisites

To run these integration tests with actual API calls, you need:

1. A valid Google Gemini API key
2. The API key set in your environment

### Setup

1. **Get a Gemini API Key**:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the generated key

2. **Configure Environment**:
   ```bash
   # In your .env file
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```

3. **Run the Tests**:
   ```bash
   # Run only the integration tests
   npm run test:run -- server/__tests__/geminiApiIntegration.test.ts
   
   # Run with UI for interactive testing
   npm run test:ui -- server/__tests__/geminiApiIntegration.test.ts
   
   # Run all tests including integration
   npm run test:run
   ```

### Without API Key

If no valid API key is provided, the tests will:
- Skip all integration tests gracefully
- Display informative messages about why tests are skipped
- Still pass (since skipping is expected behavior in CI/development)

Example output without API key:
```
⚠️  Skipping Gemini API integration tests - no valid GEMINI_API_KEY provided
   To run these tests, set a valid GEMINI_API_KEY in your .env file

✓ Skipping - no valid GEMINI_API_KEY (this is expected in CI/development)
```

## Test Behavior

### With Valid API Key
- Tests make actual API calls to Gemini
- Validates real response quality and format
- Tests actual content safety filters
- Measures real performance metrics
- Provides detailed success/failure feedback

### Without Valid API Key
- All tests are skipped with informative messages
- No API calls are made
- Tests still pass (expected behavior)
- Suitable for CI/CD environments without API keys

## Expected Results

When running with a valid API key, you should see:

```
✓ Gemini API authentication successful
✓ Simple conversation request handled successfully
✓ Meeting-related query handled appropriately
✓ Response format consistency verified
✓ Conversation context maintained successfully
✓ Meeting intent extraction successful
✓ Non-meeting conversation correctly identified
✓ Meeting titles generated successfully
✓ Email verification completed successfully
✓ Meeting agenda generated successfully
✓ Action items generated successfully
✓ Content safety filter working as expected
✓ Malformed request handled gracefully
✓ Response structure consistency validated
✓ Request completed in XXXms (within acceptable limits)
```

## Troubleshooting

### Common Issues

1. **API Key Invalid**:
   ```
   Error: Cannot read properties of undefined (reading 'ok')
   ```
   - Solution: Verify your API key is correct and has proper permissions

2. **Rate Limiting**:
   ```
   Error: Rate limit exceeded
   ```
   - Solution: Wait a moment and retry, or check your API quota

3. **Network Issues**:
   ```
   Error: Request timeout
   ```
   - Solution: Check your internet connection and try again

### Debugging

To debug integration test issues:

1. **Enable Verbose Logging**:
   ```bash
   DEBUG=* npm run test:run -- server/__tests__/geminiApiIntegration.test.ts
   ```

2. **Check API Key**:
   ```bash
   echo $GEMINI_API_KEY
   ```

3. **Test API Key Manually**:
   ```bash
   curl -H "Content-Type: application/json" \
        -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
        -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_API_KEY"
   ```

## Integration with CI/CD

These tests are designed to work in CI/CD environments:

- **Without API Key**: Tests skip gracefully and pass
- **With API Key**: Tests run full integration validation
- **Flexible Configuration**: Can be enabled/disabled per environment

Example CI configuration:
```yaml
# Only run integration tests in specific environments
- name: Run Integration Tests
  run: npm run test:run -- server/__tests__/geminiApiIntegration.test.ts
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  if: github.ref == 'refs/heads/main'
```

## Security Considerations

- **API Key Protection**: Never commit API keys to version control
- **Environment Variables**: Use secure environment variable management
- **Rate Limiting**: Be mindful of API rate limits during testing
- **Cost Management**: Monitor API usage costs for integration testing

## Maintenance

### Updating Tests

When adding new Gemini functionality:

1. Add corresponding integration tests
2. Follow the existing pattern of graceful API key handling
3. Include appropriate error handling and logging
4. Update this documentation

### Test Data

- Use realistic but non-sensitive test data
- Avoid personal information in test cases
- Use example.com domains for email testing
- Keep test inputs concise to minimize token usage

## Related Files

- `server/gemini.ts` - Main Gemini service implementation
- `server/__tests__/geminiIntegration.test.ts` - Unit tests with mocked API
- `server/__tests__/mistralIntegration.test.ts` - Legacy Mistral integration tests
- `.env` - Environment configuration
- `package.json` - Test scripts and dependencies
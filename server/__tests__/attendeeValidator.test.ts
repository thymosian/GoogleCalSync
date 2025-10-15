import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { google } from 'googleapis';
import { AttendeeValidator } from '../attendeeValidator';
import { User } from '../../shared/schema';

// Mock googleapis
vi.mock('googleapis');

const mockUser: User = {
  id: 'test-user-id',
  googleId: 'google-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: null,
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token'
};

describe('AttendeeValidator', () => {
  let validator: AttendeeValidator;
  let mockPeopleClient: any;

  beforeEach(() => {
    validator = new AttendeeValidator();
    validator.clearCache();

    mockPeopleClient = {
      people: {
        searchContacts: vi.fn(),
        get: vi.fn()
      }
    };

    (google.people as Mock).mockReturnValue(mockPeopleClient);
    (google.auth.OAuth2 as unknown as Mock).mockImplementation(() => ({
      setCredentials: vi.fn()
    }));
  });

  describe('validateEmail', () => {
    it('should return invalid for malformed email addresses', async () => {
      const result = await validator.validateEmail('invalid-email', mockUser);
      
      expect(result).toEqual({
        email: 'invalid-email',
        isValid: false,
        exists: false,
        isGoogleUser: false
      });
    });

    it('should validate email format correctly', async () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'test@',
        'test..test@example.com'
      ];

      for (const email of validEmails) {
        mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
        mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));
        
        const result = await validator.validateEmail(email, mockUser);
        expect(result.isValid).toBe(true);
      }

      for (const email of invalidEmails) {
        const result = await validator.validateEmail(email, mockUser);
        expect(result.isValid).toBe(false);
      }
    });

    it('should return person info when found in Google contacts', async () => {
      const email = 'john.doe@example.com';
      const mockResponse = {
        data: {
          results: [{
            person: {
              names: [{ givenName: 'John', familyName: 'Doe' }],
              emailAddresses: [{ value: email }],
              photos: [{ url: 'https://example.com/photo.jpg' }]
            }
          }]
        }
      };

      mockPeopleClient.people.searchContacts.mockResolvedValue(mockResponse);

      const result = await validator.validateEmail(email, mockUser);

      expect(result).toEqual({
        email,
        isValid: true,
        exists: true,
        firstName: 'John',
        lastName: 'Doe',
        profilePicture: 'https://example.com/photo.jpg',
        isGoogleUser: true
      });
    });

    it('should use cache for repeated requests', async () => {
      const email = 'cached@example.com';
      
      mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      // First call
      await validator.validateEmail(email, mockUser);
      expect(mockPeopleClient.people.searchContacts).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await validator.validateEmail(email, mockUser);
      expect(mockPeopleClient.people.searchContacts).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors gracefully', async () => {
      const email = 'error@example.com';
      
      mockPeopleClient.people.searchContacts.mockRejectedValue(new Error('API Error'));

      const result = await validator.validateEmail(email, mockUser);

      expect(result).toEqual({
        email,
        isValid: true, // Email format is valid
        exists: false,
        isGoogleUser: false
      });
    });
  });

  describe('validateBatch', () => {
    it('should validate multiple emails', async () => {
      const emails = ['test1@example.com', 'test2@example.com', 'invalid-email'];
      
      mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      const results = await validator.validateBatch(emails, mockUser);

      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
      expect(results[2].isValid).toBe(false);
    });

    it('should remove duplicates from batch validation', async () => {
      const emails = ['test@example.com', 'TEST@EXAMPLE.COM', 'test@example.com'];
      
      mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      const results = await validator.validateBatch(emails, mockUser);

      expect(results).toHaveLength(1);
      expect(results[0].email).toBe('test@example.com');
    });
  });

  describe('removeDuplicates', () => {
    it('should remove duplicate emails case-insensitively', () => {
      const emails = [
        'test@example.com',
        'TEST@EXAMPLE.COM',
        'user@domain.com',
        'test@example.com',
        'User@Domain.Com'
      ];

      const result = validator.removeDuplicates(emails);

      expect(result).toEqual([
        'test@example.com',
        'user@domain.com'
      ]);
    });

    it('should handle empty array', () => {
      const result = validator.removeDuplicates([]);
      expect(result).toEqual([]);
    });

    it('should trim whitespace', () => {
      const emails = [' test@example.com ', 'test@example.com', '  user@domain.com  '];
      const result = validator.removeDuplicates(emails);
      
      expect(result).toEqual([' test@example.com ', '  user@domain.com  ']);
    });
  });

  describe('getPersonInfo', () => {
    it('should return person info for valid Google user', async () => {
      const email = 'john@example.com';
      const mockResponse = {
        data: {
          results: [{
            person: {
              names: [{ givenName: 'John', familyName: 'Doe' }],
              emailAddresses: [{ value: email }],
              photos: [{ url: 'https://example.com/photo.jpg' }]
            }
          }]
        }
      };

      mockPeopleClient.people.searchContacts.mockResolvedValue(mockResponse);

      const result = await validator.getPersonInfo(email, mockUser);

      expect(result).toEqual({
        email,
        firstName: 'John',
        lastName: 'Doe',
        profilePicture: 'https://example.com/photo.jpg',
        isGoogleUser: true
      });
    });

    it('should return null for non-existent user', async () => {
      const email = 'nonexistent@example.com';
      
      mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      const result = await validator.getPersonInfo(email, mockUser);

      expect(result).toBeNull();
    });
  });

  describe('caching', () => {
    it('should clear cache', () => {
      validator.clearCache();
      const stats = validator.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should provide cache statistics', () => {
      const stats = validator.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should track cache hit rate correctly', async () => {
      const email = 'cache-test@example.com';
      
      mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      // First call - cache miss
      await validator.validateEmail(email, mockUser);
      let stats = validator.getCacheStats();
      expect(stats.size).toBe(1);

      // Second call - cache hit
      await validator.validateEmail(email, mockUser);
      stats = validator.getCacheStats();
      expect(stats.hitRate).toBeGreaterThan(0);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty email strings', async () => {
      const result = await validator.validateEmail('', mockUser);
      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
    });

    it('should handle whitespace-only emails', async () => {
      const result = await validator.validateEmail('   ', mockUser);
      expect(result.isValid).toBe(false);
      expect(result.exists).toBe(false);
    });

    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(100) + '@' + 'b'.repeat(100) + '.com';
      
      mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      const result = await validator.validateEmail(longEmail, mockUser);
      expect(result.isValid).toBe(false); // Should be invalid due to length
    });

    it('should handle international domain names', async () => {
      const internationalEmails = [
        'test@münchen.de',
        'user@тест.рф',
        'contact@例え.テスト'
      ];

      mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      for (const email of internationalEmails) {
        const result = await validator.validateEmail(email, mockUser);
        // These should be handled gracefully, even if not fully supported
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('exists');
      }
    });

    it('should handle Google API rate limiting', async () => {
      const email = 'rate-limited@example.com';
      
      mockPeopleClient.people.searchContacts.mockRejectedValue({
        code: 429,
        message: 'Rate limit exceeded'
      });

      const result = await validator.validateEmail(email, mockUser);
      
      expect(result.isValid).toBe(true); // Email format is valid
      expect(result.exists).toBe(false); // But existence couldn't be verified
      expect(result.isGoogleUser).toBe(false);
    });

    it('should handle Google API authentication errors', async () => {
      const email = 'auth-error@example.com';
      
      mockPeopleClient.people.searchContacts.mockRejectedValue({
        code: 401,
        message: 'Authentication required'
      });

      const result = await validator.validateEmail(email, mockUser);
      
      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(false);
      expect(result.isGoogleUser).toBe(false);
    });

    it('should handle malformed Google API responses', async () => {
      const email = 'malformed@example.com';
      
      mockPeopleClient.people.searchContacts.mockResolvedValue({
        data: {
          results: [{
            person: {
              // Missing expected fields
              emailAddresses: [{ value: email }]
            }
          }]
        }
      });

      const result = await validator.validateEmail(email, mockUser);
      
      expect(result.isValid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.isGoogleUser).toBe(true);
      expect(result.firstName).toBeUndefined();
    });

    it('should handle batch validation with mixed results', async () => {
      const emails = [
        'valid@example.com',
        'invalid-email',
        'another@domain.com',
        '', // Empty email
        'duplicate@test.com',
        'DUPLICATE@TEST.COM' // Case variation
      ];

      mockPeopleClient.people.searchContacts.mockImplementation((params) => {
        const query = params.query;
        if (query.includes('valid@example.com')) {
          return Promise.resolve({
            data: {
              results: [{
                person: {
                  names: [{ givenName: 'Valid', familyName: 'User' }],
                  emailAddresses: [{ value: 'valid@example.com' }]
                }
              }]
            }
          });
        }
        return Promise.resolve({ data: { results: [] } });
      });

      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      const results = await validator.validateBatch(emails, mockUser);
      
      // Should handle duplicates and invalid emails
      expect(results.length).toBeLessThan(emails.length);
      expect(results.some(r => r.email === 'valid@example.com' && r.firstName === 'Valid')).toBe(true);
      expect(results.some(r => r.email === 'invalid-email' && !r.isValid)).toBe(true);
    });

    it('should handle concurrent validation requests', async () => {
      const emails = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);
      
      mockPeopleClient.people.searchContacts.mockResolvedValue({ data: { results: [] } });
      mockPeopleClient.people.get.mockRejectedValue(new Error('Not found'));

      // Make concurrent requests
      const promises = emails.map(email => validator.validateEmail(email, mockUser));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result.email).toBe(emails[index]);
        expect(result.isValid).toBe(true);
      });
    });
  });
});
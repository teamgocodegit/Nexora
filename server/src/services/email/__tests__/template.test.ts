import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  extractVariables,
  hasUnresolvedVariables,
  sanitizeHtml,
  type TemplateContext,
} from '../template.service';

const BASE_CONTEXT: TemplateContext = {
  participantName: 'John Doe',
  teamName: 'Team Alpha',
  teamId: 'NEX-001',
  leaderName: 'Jane Leader',
  leaderEmail: 'jane@test.com',
  hackathonName: 'HackFest 2025',
  hackathonVenue: 'Main Hall',
  roomName: 'Room 101',
  eventDate: 'Monday, March 15, 2025',
  eventTime: '09:00 AM',
  registrationId: 'REG-001',
  certificateUrl: 'https://example.com/cert/123',
};

describe('Template Service', () => {
  describe('renderTemplate', () => {
    it('should replace valid variables with context values', () => {
      const template = 'Hello {{participant_name}}, welcome to {{hackathon_name}}!';
      const result = renderTemplate(template, BASE_CONTEXT);
      expect(result).toBe('Hello John Doe, welcome to HackFest 2025!');
    });

    it('should use default values for missing variables that have defaults', () => {
      const template = 'Room: {{room_name}}, Date: {{event_date}}';
      const context = { ...BASE_CONTEXT, room_name: '', event_date: '' };
      context.roomName = '';
      context.eventDate = '';
      const result = renderTemplate(template, context);
      expect(result).toBe('Room: TBD, Date: TBD');
    });

    it('should leave unknown variables unresolved', () => {
      const template = 'Hello {{unknown_var}}';
      const result = renderTemplate(template, BASE_CONTEXT);
      expect(result).toBe('Hello {{unknown_var}}');
    });

    it('should handle empty template', () => {
      expect(renderTemplate('', BASE_CONTEXT)).toBe('');
    });

    it('should handle template with no variables', () => {
      const template = 'Plain text email';
      expect(renderTemplate(template, BASE_CONTEXT)).toBe('Plain text email');
    });

    it('should replace multiple occurrences of same variable', () => {
      const template = '{{participant_name}} is {{participant_name}}';
      expect(renderTemplate(template, BASE_CONTEXT)).toBe('John Doe is John Doe');
    });

    it('should handle all variables simultaneously', () => {
      const template = Object.keys(BASE_CONTEXT).map((k) => `{{${k}}}`).join(' ');
      const result = renderTemplate(template, BASE_CONTEXT);
      Object.values(BASE_CONTEXT).forEach((val) => {
        expect(result).toContain(val);
      });
    });
  });

  describe('extractVariables', () => {
    it('should extract unique variable names', () => {
      const template = 'Hello {{name}}, your {{name}} is {{id}}';
      expect(extractVariables(template)).toEqual(['name', 'id']);
    });

    it('should return empty array for template without variables', () => {
      expect(extractVariables('No variables')).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(extractVariables('')).toEqual([]);
    });
  });

  describe('hasUnresolvedVariables', () => {
    it('should return true if variables remain', () => {
      expect(hasUnresolvedVariables('Hello {{unknown}}')).toBe(true);
    });

    it('should return false if no unresolved variables', () => {
      const rendered = renderTemplate('Hello {{participant_name}}', BASE_CONTEXT);
      expect(hasUnresolvedVariables(rendered)).toBe(false);
    });
  });

  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const input = '<p>Hello</p><script>alert("xss")</script>';
      expect(sanitizeHtml(input)).toBe('<p>Hello</p>');
    });

    it('should remove script tags with content', () => {
      const input = '<script>document.cookie</script><p>Safe</p>';
      expect(sanitizeHtml(input)).toBe('<p>Safe</p>');
    });

    it('should remove inline event handlers', () => {
      const input = '<p onclick="alert(1)">Click</p><img onerror="steal()" src=x>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onerror');
      expect(result).toContain('Click');
      expect(result).toContain('<img');
    });

    it('should remove javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">Link</a>';
      expect(sanitizeHtml(input)).toBe('<a href="alert(1)">Link</a>');
    });

    it('should remove iframe tags', () => {
      const input = '<p>Text</p><iframe src="https://evil.com"></iframe>';
      expect(sanitizeHtml(input)).toBe('<p>Text</p>');
    });

    it('should remove embed tags', () => {
      const input = '<embed src="evil.swf">';
      expect(sanitizeHtml(input)).toBe('');
    });

    it('should remove object tags', () => {
      const input = '<object data="evil.swf"></object>';
      expect(sanitizeHtml(input)).toBe('');
    });

    it('should preserve safe HTML', () => {
      const input = '<p><strong>Safe</strong> <em>HTML</em></p><ul><li>Item</li></ul><a href="https://example.com">Link</a>';
      expect(sanitizeHtml(input)).toBe(input);
    });
  });
});

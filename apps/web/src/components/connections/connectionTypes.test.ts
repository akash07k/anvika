import { describe, expect, it } from 'vitest';

import { CONNECTION_TYPES } from '@anvika/shared/settings/connection';

import { CONNECTION_TYPE_DESCRIPTORS } from './connectionTypes';

describe('CONNECTION_TYPE_DESCRIPTORS', () => {
  it('has a descriptor with a non-empty label for every CONNECTION_TYPES entry', () => {
    for (const type of CONNECTION_TYPES) {
      const descriptor = CONNECTION_TYPE_DESCRIPTORS[type];
      expect(descriptor, `missing descriptor for "${type}"`).toBeDefined();
      expect(descriptor.label.length, `empty label for "${type}"`).toBeGreaterThan(0);
    }
  });

  it('openai-compatible has a required baseUrl field and a headers field', () => {
    const { fields } = CONNECTION_TYPE_DESCRIPTORS['openai-compatible'];
    const baseUrlField = fields.find((f) => f.key === 'baseUrl');
    const headersField = fields.find((f) => f.key === 'headers');
    expect(baseUrlField, 'baseUrl field missing from openai-compatible').toBeDefined();
    expect(baseUrlField?.required, 'baseUrl should be required for openai-compatible').toBe(true);
    expect(headersField, 'headers field missing from openai-compatible').toBeDefined();
    expect(headersField?.kind).toBe('headers');
  });

  it('azure includes resourceName, baseUrl, and apiVersion fields', () => {
    const { fields } = CONNECTION_TYPE_DESCRIPTORS['azure'];
    const keys = fields.map((f) => f.key);
    expect(keys).toContain('resourceName');
    expect(keys).toContain('baseUrl');
    expect(keys).toContain('apiVersion');
  });
});

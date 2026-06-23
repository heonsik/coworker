import { describe, expect, it } from 'vitest';
import { normalizeSelectedModelForSdk } from '../../../src/opencode/model-runtime-mapping.js';

describe('normalizeSelectedModelForSdk', () => {
  it('normalizes OpenRouter models for SDK prompt calls', () => {
    expect(
      normalizeSelectedModelForSdk({
        provider: 'openrouter',
        model: 'openrouter/z-ai/glm-5.2',
      }),
    ).toEqual({
      providerID: 'openrouter',
      modelID: 'z-ai/glm-5.2',
    });
  });
});

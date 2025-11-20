import * as path from 'path';
import { GeminiFileSearchAssistantOptions } from './geminiFileSearchAssistant.types';

const onboardingGuidePath = path.resolve(
  process.cwd(),
  'resources',
  'multi-store',
  'onboarding-tips.txt',
);

export const defaultGeminiFileSearchAssistantOptions: GeminiFileSearchAssistantOptions = {
  storeSeeds: [
    {
      displayName: 'Onboarding Knowledge Base',
      files: [
        {
          path: onboardingGuidePath,
          displayName: 'Onboarding Tips',
          mimeType: 'text/plain',
        },
      ],
    },
  ],
};

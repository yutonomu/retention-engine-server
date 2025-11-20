import * as path from 'path';
import { GeminiFileSearchAssistantOptions } from './geminiFileSearchAssistant.types';

const onboardingGuidePath = path.resolve(
  process.cwd(),
  'resources',
  'onboarding-tips.txt',
);
const onboardingGuidePath2 = path.resolve(
  process.cwd(),
  'resources',
  'onboarding-tips2.txt',
);
const sonunPath = path.resolve(process.cwd(), 'resources', 'sonun-tips.txt');

export const defaultGeminiFileSearchAssistantOptions: GeminiFileSearchAssistantOptions =
  {
    storeSeeds: [
      {
        displayName: 'Onboarding Knowledge Base',
        files: [
          {
            path: onboardingGuidePath,
            displayName: 'Onboarding Tips',
            mimeType: 'text/plain',
          },
          {
            path: onboardingGuidePath2,
            displayName: 'Onboarding Tips 2',
            mimeType: 'text/plain',
          },
          {
            path: sonunPath,
            displayName: 'Sonun Tips',
            mimeType: 'text/plain',
          },
        ],
      },
    ],
  };

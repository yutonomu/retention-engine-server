import * as path from 'path';
import { MultiStoreChatOptions } from './multi-store-chat.types';

const onboardingGuidePath = path.resolve(
  process.cwd(),
  'resources',
  'multi-store',
  'onboarding-tips.txt',
);

export const defaultMultiStoreChatOptions: MultiStoreChatOptions = {
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

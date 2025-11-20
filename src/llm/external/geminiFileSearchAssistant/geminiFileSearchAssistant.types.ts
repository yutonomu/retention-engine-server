export type FileSeed = {
  path: string;
  displayName: string;
  mimeType?: string;
};

export type StoreSeed = {
  displayName: string;
  files: FileSeed[];
  existingName?: string;
  questions?: string[];
};

export type StoreRegistry = Record<string, string>;

export type GeminiFileSearchAssistantOptions = {
  storeSeeds: StoreSeed[];
};

export type PrepareStoresOptions = {
  importFiles?: boolean;
  forceImport?: boolean;
};

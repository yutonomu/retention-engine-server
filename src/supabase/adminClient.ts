import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: GenericRelationship[];
};

type GenericNonUpdatableView = {
  Row: Record<string, unknown>;
  Relationships: GenericRelationship[];
};

type GenericUpdatableView = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: GenericRelationship[];
};

type GenericView = GenericUpdatableView | GenericNonUpdatableView;

type GenericFunction = {
  Args: Record<string, unknown> | never;
  Returns: unknown;
  SetofOptions?: {
    isSetofReturn?: boolean;
    isOneToOne?: boolean;
    isNotNullable?: boolean;
    to: string;
    from: string;
  };
};

type GenericSchema = {
  Tables: Record<string, GenericTable>;
  Views: Record<string, GenericView>;
  Functions: Record<string, GenericFunction>;
};

type GenericSupabaseSchema = {
  public: GenericSchema & {
    Enums: Record<string, string>;
    CompositeTypes: Record<string, unknown>;
  };
};

export type SupabaseAdminClient = SupabaseClient<
  GenericSupabaseSchema,
  'public'
>;

export const createAdminSupabaseClient = (): SupabaseAdminClient => {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set.');
  }
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  }
  return createClient<GenericSupabaseSchema, 'public'>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

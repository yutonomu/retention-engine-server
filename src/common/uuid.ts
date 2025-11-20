import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

export type UUID = string & { readonly __brand: unique symbol };

export function createUUID(): UUID {
  return uuidv7() as UUID;
}

export const UUIDSchema = z
  .string()
  .uuid()
  .transform((value) => value as UUID);

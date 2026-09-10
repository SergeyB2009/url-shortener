import { z } from 'zod';

export const shortenSchema = z.object({
  originalUrl: z
    .string()
    .url()
    .refine((url) => /^https?:\/\//i.test(url), {
      message: 'URL must start with http:// or https://',
    }),
});

export const statsSchema = z.object({
  shortCode: z
    .string()
    .regex(/^[a-zA-Z0-9]{1,10}$/, 'Invalid short code format'),
});

export type ShortenInput = z.infer<typeof shortenSchema>;
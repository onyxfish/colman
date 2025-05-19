// 1. Import utilities from `astro:content`
import { z, defineCollection } from 'astro:content';

// 2. Define a `type` and `schema` for each collection
const printsCollection = defineCollection({
  type: 'content', // v2.5.0 and later
  schema: z.object({
    id: z.number(),
    title: z.string(),
    image: z.object({
      filename: z.string().nullable(),
      caption: z.string().nullable(),
      missing_text: z.string().nullable()
    }),
    year: z.string(),
    size: z.object({
      dimensions: z.string().nullable(),
      source: z.string().nullable(),
      source_url: z.string().url().nullable()
    }),
    signed: z.string().nullable(),
    publications: z.string().array(),
    drawings: z.object({
      name: z.string(),
      url: z.string().url()
    }).array(),
    museums: z.object({
      name: z.string(),
      url: z.string().url()
    }).array(),
    complete: z.boolean().nullable()
  }),
});

// 3. Export a single `collections` object to register your collection(s)
export const collections = {
  'prints': printsCollection,
};
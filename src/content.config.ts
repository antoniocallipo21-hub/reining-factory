import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const horseSchema = z.object({
  name: z.string().default("Nome non specificato"),
  nickname: z.string().optional(),
  nickname_en: z.string().optional(),
  badge: z.string().optional(),
  badge_en: z.string().optional(),
  badge_card: z.string().optional(),
  badge_card_en: z.string().optional(),
  badge_hero: z.string().optional(),
  badge_hero_en: z.string().optional(),
  yearOfBirth: z.union([z.number(), z.string()]).optional().default(0),
  yearOfDeath: z.union([z.number(), z.string()]).optional(),
  breed: z.string().optional().default("AQHA/APHA"),
  color: z.string().optional().default("N/D"),
  height: z.string().optional(),
  height_en: z.string().optional(),
  owner: z.string().optional(),
  location: z.string().optional(),
  logo: z.string().optional(),
  description_it: z.string().optional(),
  description_en: z.string().optional(),
  
  mainImage: z.string().optional().default("/placeholder-horse.jpg"),
  cardImage: z.string().optional(),
  heroImages: z.array(z.string()).optional().default([]),
  gallery: z.array(z.string()).optional().default([]),
  
  stats: z.object({
    earnings: z.string().optional(),
    earnings_en: z.string().optional(),
    offspringEarnings: z.string().optional(),
    offspringEarnings_en: z.string().optional(),
    sireRecord: z.string().optional(),
    sireRecord_en: z.string().optional(),
  }).optional(),

  geneticTest: z.record(z.string(), z.string()).optional(),
  whitePattern: z.string().optional(),
  colorpanel: z.string().optional(),
  geneticCertificateUrl: z.string().optional(),
  colorCertificateUrl: z.string().optional(),

  pedigree: z.object({
    sire: z.string().optional(),
    dam: z.string().optional(),
    grandsire_sire: z.string().optional(),
    grandsire_dam: z.string().optional(),
    granddam_sire: z.string().optional(),
    granddam_dam: z.string().optional(),
  }).optional(),
  pedigreeUrl: z.string().optional(),

  videoUrl: z.string().optional(),
  
  achievements: z.array(z.object({
    year: z.string().optional(),
    title: z.string().optional(),
  })).optional(),

  offspring: z.array(z.object({
    name: z.string().optional(),
    earnings: z.string().optional(),
    sire: z.string().optional(),
  })).optional(),

  breeding: z.object({
    fee: z.string().optional(),
    fee_en: z.string().optional(),
    semenType: z.string().optional(),
    semenType_en: z.string().optional(),
    semenNotes: z.string().optional(),
    semenNotes_en: z.string().optional(),
    status: z.string().optional(),
    status_en: z.string().optional(),
    statusNotes: z.string().optional(),
    statusNotes_en: z.string().optional(),
  }).optional(),

  breedingLinks: z.array(z.object({
    label: z.string(),
    url: z.string(),
    primary: z.boolean().default(false),
  })).optional(),

  social: z.object({
    instagram: z.string().optional(),
    facebook: z.string().optional(),
    tiktok: z.string().optional(),
    website: z.string().optional(),
  }).optional(),

  origine: z.string().optional().default("USA"),
  isElite: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  tags: z.array(z.string()).optional().default([]),
}).passthrough();

const stalloni = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/stalloni" }),
  schema: horseSchema,
});

const fattrici = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/fattrici" }),
  schema: horseSchema,
});

export const collections = {
  'stalloni': stalloni,
  'fattrici': fattrici,
};

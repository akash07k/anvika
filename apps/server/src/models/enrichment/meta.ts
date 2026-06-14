import { z } from 'zod';

/** Zod schema for {@link ModelMeta}; every field is a nullable USD-per-million price / token count. */
export const ModelMetaSchema = z.object({
  inputPrice: z.number().nullable(),
  outputPrice: z.number().nullable(),
  contextWindow: z.number().nullable(),
  maxOutputTokens: z.number().nullable(),
});

/** The enrichable metadata for a model (all nullable; prices are USD per million tokens). */
export type ModelMeta = z.infer<typeof ModelMetaSchema>;

/** The all-null metadata, returned when no enrichment layer has data for a model. */
export const NULL_META: ModelMeta = {
  inputPrice: null,
  outputPrice: null,
  contextWindow: null,
  maxOutputTokens: null,
};

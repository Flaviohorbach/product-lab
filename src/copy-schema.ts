import { z } from "zod";

/**
 * What the model must return. The same schema is used twice:
 *  1. converted to JSON Schema and sent to the API, so the model is constrained to this shape;
 *  2. to validate the response here, because the API ignores some keywords (e.g. maxLength).
 *
 * Field descriptions are part of the prompt: the model reads them.
 */
export const ProductCopySchema = z.object({
  title: z.string().max(60).describe("Título do produto para a vitrine, até 60 caracteres."),
  shortDescription: z.string().max(160).describe("Resumo de uma frase para listagens, até 160 caracteres."),
  longDescription: z.string().describe("Descrição de 2 ou 3 parágrafos, texto corrido sem markdown."),
  highlights: z.array(z.string()).min(3).max(5).describe("De 3 a 5 destaques curtos do produto."),
  seo: z.object({
    metaTitle: z.string().max(60).describe("Título para o Google, até 60 caracteres."),
    metaDescription: z.string().max(155).describe("Descrição para o Google, até 155 caracteres."),
    keywords: z.array(z.string()).min(3).max(8).describe("De 3 a 8 palavras-chave de busca."),
  }),
  visualAttributes: z.object({
    colors: z.array(z.string()).describe("Cores visíveis na foto."),
    notes: z.string().describe("O que mais a foto mostra e a ficha não diz, em uma frase."),
  }),
  missingInfo: z
    .array(z.string())
    .describe("Informações que um cliente procuraria e que não estão na ficha nem na foto."),
});

export type ProductCopy = z.infer<typeof ProductCopySchema>;

/** JSON Schema sent to the API. */
export const productCopyJsonSchema = z.toJSONSchema(ProductCopySchema, { target: "draft-2020-12" });

import { readFile } from "node:fs/promises";
import { z } from "zod";

/** A product as the store's catalog provides it: the only source of truth for the copy. */
export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  brand: z.string().nullable(),
  priceBRL: z.number(),
  attributes: z.record(z.string(), z.string()),
  notes: z.string().nullable(),
  imageUrl: z.string().url(),
});

export type Product = z.infer<typeof ProductSchema>;

export async function loadProducts(path = "data/products.json"): Promise<Product[]> {
  return z.array(ProductSchema).parse(JSON.parse(await readFile(path, "utf8")));
}

/** Renders the spec sheet as plain text, the way it goes into the prompt. */
export function specSheet(product: Product): string {
  const lines = [
    `Nome: ${product.name}`,
    `Categoria: ${product.category}`,
    `Marca: ${product.brand ?? "não informada"}`,
    `Preço: R$ ${product.priceBRL.toFixed(2).replace(".", ",")}`,
    ...Object.entries(product.attributes).map(([key, value]) => `${key}: ${value}`),
  ];
  if (product.notes) lines.push(`Observações: ${product.notes}`);
  return lines.join("\n");
}

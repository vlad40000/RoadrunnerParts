import { z } from "zod";

export const ebayListingSchema = z.object({
  title: z.string(),
  price: z.number(),
  shipping: z.number(),
  isSold: z.boolean(),
  dateSold: z.string().nullable().optional(),
  condition: z.enum(["New", "Used", "Open Box", "Parts only"]),
  sellerRating: z.string().nullable().optional(),
});

export const ebaySummarySchema = z.object({
  avgSoldPrice: z.number(),
  avgActivePrice: z.number(),
  priceRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  marketVelocity: z.enum(["Low", "Medium", "High"]),
  recommendation: z.string(),
});

export const ebayDraftSchema = z.object({
  title: z.string(),
  suggestedPrice: z.number(),
  shippingService: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export type EbayListing = z.infer<typeof ebayListingSchema>;
export type EbaySummary = z.infer<typeof ebaySummarySchema>;
export type EbayDraft = z.infer<typeof ebayDraftSchema>;

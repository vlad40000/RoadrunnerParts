import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

/**
 * System 2 — eBay Market / Listing Functions
 */

export const ebay_search_active_by_part_number: FunctionDeclaration = {
  name: "ebay_search_active_by_part_number",
  description: "Search active eBay listings for an exact appliance OEM part number. Return listing title, price, shipping, condition, seller signal, item URL, and match confidence. This is resale signal only, not retail pricing.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      partName: { type: SchemaType.STRING },
      brand: { type: SchemaType.STRING },
      applianceType: { type: SchemaType.STRING },
      marketplaceId: { type: SchemaType.STRING },
      maxResults: { type: SchemaType.INTEGER },
    },
    required: ["partNumber"],
  },
};

export const ebay_search_sold_by_part_number: FunctionDeclaration = {
  name: "ebay_search_sold_by_part_number",
  description: "Search eBay sold/completed listing history for an exact appliance OEM part number. Return sold price, shipping, condition, sold date, URL, and match confidence. This is resale signal only.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      partName: { type: SchemaType.STRING },
      brand: { type: SchemaType.STRING },
      marketplaceId: { type: SchemaType.STRING },
      lookbackDays: { type: SchemaType.INTEGER },
      maxResults: { type: SchemaType.INTEGER },
    },
    required: ["partNumber"],
  },
};

export const filter_ebay_listing_matches: FunctionDeclaration = {
  name: "filter_ebay_listing_matches",
  description: "Filter eBay active/sold listings to clean exact-part comps. Exclude unrelated parts, lots, for-parts-only listings, untested items, damaged items, ambiguous substitutes, and model-only matches without exact part number.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      listingBatchId: { type: SchemaType.STRING },
    },
    required: ["partNumber", "listingBatchId"],
  },
};

export const calculate_ebay_sell_through: FunctionDeclaration = {
  name: "calculate_ebay_sell_through",
  description: "Calculate sell-through rate from filtered active and sold listings. This is demand signal only.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      filteredActiveBatchId: { type: SchemaType.STRING },
      filteredSoldBatchId: { type: SchemaType.STRING },
    },
    required: ["partNumber", "filteredActiveBatchId", "filteredSoldBatchId"],
  },
};

export const calculate_ebay_net_expected: FunctionDeclaration = {
  name: "calculate_ebay_net_expected",
  description: "Calculate expected net resale value using sold comps minus marketplace fees, shipping, packaging, and labor. Does not produce retail price.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      medianSoldPrice: { type: SchemaType.NUMBER },
      marketplaceFees: { type: SchemaType.NUMBER },
      shippingCost: { type: SchemaType.NUMBER },
      packagingCost: { type: SchemaType.NUMBER },
      laborCost: { type: SchemaType.NUMBER },
    },
    required: ["partNumber", "medianSoldPrice"],
  },
};

export const generate_ebay_price_recommendation: FunctionDeclaration = {
  name: "generate_ebay_price_recommendation",
  description: "Recommend eBay listing price using resale comps, active competition, sell-through, and margin. This does not affect verified retail price.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      marketSnapshotId: { type: SchemaType.STRING },
    },
    required: ["partNumber", "marketSnapshotId"],
  },
};

export const generate_ebay_title: FunctionDeclaration = {
  name: "generate_ebay_title",
  description: "Generate optimized eBay title using exact OEM part number, brand, part name, condition, OEM, and one verified fit model.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      partName: { type: SchemaType.STRING },
      brand: { type: SchemaType.STRING },
      condition: { type: SchemaType.STRING },
      verifiedFitModel: { type: SchemaType.STRING },
    },
    required: ["partNumber", "partName", "brand", "condition"],
  },
};

export const generate_ebay_description: FunctionDeclaration = {
  name: "generate_ebay_description",
  description: "Generate eBay listing description from canonical part data, donor machine, condition, verified fitment, and photos.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      partName: { type: SchemaType.STRING },
      condition: { type: SchemaType.STRING },
      donorModel: { type: SchemaType.STRING },
    },
    required: ["partNumber", "partName", "condition", "donorModel"],
  },
};

export const generate_ebay_item_specifics: FunctionDeclaration = {
  name: "generate_ebay_item_specifics",
  description: "Generate eBay item specifics for appliance part listings.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      brand: { type: SchemaType.STRING },
      partName: { type: SchemaType.STRING },
      condition: { type: SchemaType.STRING },
    },
    required: ["partNumber", "brand", "partName", "condition"],
  },
};

export const create_ebay_draft_listing: FunctionDeclaration = {
  name: "create_ebay_draft_listing",
  description: "Create eBay draft listing from approved listing payload. Does not publish without user/shop approval.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partInventoryId: { type: SchemaType.STRING },
      title: { type: SchemaType.STRING },
      description: { type: SchemaType.STRING },
      price: { type: SchemaType.NUMBER },
      photos: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
      },
    },
    required: ["partInventoryId", "title", "description", "price", "photos"],
  },
};

export const revise_ebay_listing_price: FunctionDeclaration = {
  name: "revise_ebay_listing_price",
  description: "Revise an existing eBay listing price based on updated market signal or aging.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      listingId: { type: SchemaType.STRING },
      newPrice: { type: SchemaType.NUMBER },
    },
    required: ["listingId", "newPrice"],
  },
};

export const end_ebay_listing_when_inventory_sold: FunctionDeclaration = {
  name: "end_ebay_listing_when_inventory_sold",
  description: "End an eBay listing because the underlying inventory has been sold on another channel or disposed.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      listingId: { type: SchemaType.STRING },
      reason: { type: SchemaType.STRING },
    },
    required: ["listingId", "reason"],
  },
};

export const db_upsert_market_snapshot: FunctionDeclaration = {
  name: "db_upsert_market_snapshot",
  description: "Persist eBay market snapshot for an OEM part number. Rule: Resale signal only.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      snapshot: { type: SchemaType.OBJECT, properties: {} },
    },
    required: ["partNumber", "snapshot"],
  },
};

export const db_upsert_channel_listing: FunctionDeclaration = {
  name: "db_upsert_channel_listing",
  description: "Persist eBay listing details for a part in inventory.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partInventoryId: { type: SchemaType.STRING },
      channelListingId: { type: SchemaType.STRING },
      listingPayload: { type: SchemaType.OBJECT, properties: {} },
    },
    required: ["partInventoryId", "channelListingId", "listingPayload"],
  },
};

export const EBAY_MARKET_TOOLS = [
  ebay_search_active_by_part_number,
  ebay_search_sold_by_part_number,
  filter_ebay_listing_matches,
  calculate_ebay_sell_through,
  calculate_ebay_net_expected,
  generate_ebay_price_recommendation,
  generate_ebay_title,
  generate_ebay_description,
  generate_ebay_item_specifics,
  create_ebay_draft_listing,
  revise_ebay_listing_price,
  end_ebay_listing_when_inventory_sold,
  db_upsert_market_snapshot,
  db_upsert_channel_listing,
];

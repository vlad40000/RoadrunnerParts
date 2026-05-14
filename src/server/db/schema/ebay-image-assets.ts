import { pgTable, text, timestamp, uuid, integer, jsonb, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";

export const ebayListingImageAssets = pgTable(
  "ebay_listing_image_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partNumber: text("part_number").notNull(),
    imageUrl: text("image_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    pageUrl: text("page_url"),
    title: text("title"),
    sourceDomain: text("source_domain"),
    source: text("source"),
    reviewStatus: text("review_status"),
    score: numeric("score", { precision: 10, scale: 2 }),
    blobPathname: text("blob_pathname"),
    remoteImageUrl: text("remote_image_url"),
    localImagePath: text("local_image_path"),
    mimeType: text("mime_type"),
    byteLength: integer("byte_length"),
    metadata: jsonb("metadata").notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partImageUnique: uniqueIndex("ebay_listing_image_asset_part_image_uidx").on(
      table.partNumber,
      table.imageUrl,
    ),
    partLastSeenIdx: index("ebay_listing_image_asset_part_idx").on(
      table.partNumber,
      table.lastSeenAt,
    ),
  }),
);

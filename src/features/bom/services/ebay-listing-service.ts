import { db } from "@/server/db";
import { channelListings, partInventory, partMarketSignals } from "@/server/db/schema/ebay-market";
import { eq } from "drizzle-orm";

export async function createEbayDraftListing(input: {
  partInventoryId: string;
  title: string;
  description: string;
  price: number;
  photos: string[];
}) {
  // 1. Verify part inventory exists
  const [part] = await db
    .select()
    .from(partInventory)
    .where(eq(partInventory.id, input.partInventoryId));

  if (!part) {
    throw new Error(`Part inventory not found for ID: ${input.partInventoryId}`);
  }

  // 2. Create the draft in channel_listing
  const [draft] = await db
    .insert(channelListings)
    .values({
      partInventoryId: input.partInventoryId,
      channel: "ebay",
      listingStatus: "draft",
      title: input.title,
      listingPrice: String(input.price),
      raw: {
        description: input.description,
        photos: input.photos,
        source: "agent_orchestrator"
      }
    })
    .returning();

  // 3. Update the part inventory to show it's listed on eBay
  const currentChannels = part.listedChannels || [];
  if (!currentChannels.includes("ebay")) {
    await db
      .update(partInventory)
      .set({
        listedChannels: [...currentChannels, "ebay"]
      })
      .where(eq(partInventory.id, input.partInventoryId));
  }

  return {
    status: "draft_created",
    listingId: String(draft.id),
    partInventoryId: input.partInventoryId,
    title: draft.title
  };
}

export async function upsertMarketSnapshot(input: {
  partNumber: string;
  snapshot: any;
}) {
  const [result] = await db
    .insert(partMarketSignals)
    .values({
      partNumber: input.partNumber,
      ebayActiveCount: input.snapshot.activeCount,
      ebaySoldCount: input.snapshot.soldCount,
      sellThroughRate: String(input.snapshot.sellThroughRate || 0),
      medianSoldPrice: String(input.snapshot.medianSoldPrice || 0),
      netExpected: String(input.snapshot.netExpected || 0),
      confidence: input.snapshot.confidence || "low",
      raw: input.snapshot
    })
    .returning();

  return { status: "success", id: String(result.id), partNumber: input.partNumber };
}

export async function upsertChannelListing(input: {
  partInventoryId: string;
  channelListingId?: string;
  listingPayload: any;
}) {
  if (input.channelListingId) {
    const [updated] = await db
      .update(channelListings)
      .set({
        title: input.listingPayload.title,
        listingPrice: String(input.listingPayload.price || 0),
        raw: input.listingPayload,
        listingStatus: input.listingPayload.status || "active"
      })
      .where(eq(channelListings.id, BigInt(input.channelListingId)))
      .returning();
    
    return { status: "success", channelListingId: String(updated.id) };
  } else {
    const [inserted] = await db
      .insert(channelListings)
      .values({
        partInventoryId: input.partInventoryId,
        channel: "ebay",
        title: input.listingPayload.title,
        listingPrice: String(input.listingPayload.price || 0),
        raw: input.listingPayload,
        listingStatus: input.listingPayload.status || "active"
      })
      .returning();

    return { status: "success", channelListingId: String(inserted.id) };
  }
}


import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function MarketPage() {
  redirect("/bom-workflow?action=market_ops");
}

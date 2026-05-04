import { ScraperCockpit } from '@/features/scraper/components/scraper-cockpit';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scraper Cockpit | RoadrunnerParts',
  description: 'Agentic parsing and scraping interface for appliance BOM data extraction.',
};

export default function ScraperPage() {
  return (
    <div className="h-screen w-full">
      <ScraperCockpit />
    </div>
  );
}

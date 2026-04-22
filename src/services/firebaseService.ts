// Mock Firebase Service to satisfy typecheck after removal
export interface PartReview {
  id?: string;
  partNumber: string;
  rating: number;
  comment: string;
  userId: string;
  userEmail: string;
  status: 'installed' | 'used';
  createdAt: any;
}

export interface PartMetadata {
  partNumber: string;
  avgRating: number;
  reviewCount: number;
}

export async function getPartMetadata(partNumber: string): Promise<PartMetadata | null> {
  console.warn("getPartMetadata called but Firebase is gone.");
  return null;
}

export async function getPartReviews(partNumber: string): Promise<PartReview[]> {
  console.warn("getPartReviews called but Firebase is gone.");
  return [];
}

export async function submitReview(review: Omit<PartReview, 'id' | 'createdAt'>) {
  console.warn("submitReview called but Firebase is gone.");
}

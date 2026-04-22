import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  runTransaction,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

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
  const partRef = doc(db, 'parts', partNumber);
  const snap = await getDoc(partRef);
  return snap.exists() ? (snap.data() as PartMetadata) : null;
}

export async function getPartReviews(partNumber: string): Promise<PartReview[]> {
  const reviewsRef = collection(db, 'parts', partNumber, 'reviews');
  const q = query(reviewsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PartReview));
}

export async function submitReview(review: Omit<PartReview, 'id' | 'createdAt'>) {
  const partNumber = review.partNumber;
  const partRef = doc(db, 'parts', partNumber);
  const reviewRef = doc(collection(db, 'parts', partNumber, 'reviews'));

  await runTransaction(db, async (transaction) => {
    const partSnap = await transaction.get(partRef);
    let metadata: PartMetadata = partSnap.exists() 
      ? (partSnap.data() as PartMetadata) 
      : { partNumber, avgRating: 0, reviewCount: 0 };

    // Calculate new average
    const totalRating = metadata.avgRating * metadata.reviewCount + review.rating;
    const newCount = metadata.reviewCount + 1;
    const newAvg = totalRating / newCount;

    transaction.set(partRef, {
      partNumber,
      avgRating: newAvg,
      reviewCount: newCount
    });

    transaction.set(reviewRef, {
      ...review,
      createdAt: serverTimestamp()
    });
  });
}

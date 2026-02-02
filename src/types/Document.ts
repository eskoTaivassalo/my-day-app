export type DocumentCategory = 'receipt' | 'contract' | 'invoice' | 'certificate' | 'other';

export interface Document {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: DocumentCategory;
  fileUrl: string;
  fileName: string;
  fileType: string; // 'pdf', 'docx', 'image', etc.
  fileSize: number;
  thumbnailUrl?: string; // For images
  date: Date;
  tags: string[]; // For better searchability
  createdAt: Date;
  updatedAt: Date;
}

export const DOCUMENT_CATEGORIES = {
  receipt: { label: 'Kuitti', icon: '🧾', color: '#10B981' },
  contract: { label: 'Sopimus', icon: '📄', color: '#6366F1' },
  invoice: { label: 'Lasku', icon: '💰', color: '#F59E0B' },
  certificate: { label: 'Todistus', icon: '🏆', color: '#EC4899' },
  other: { label: 'Muu', icon: '📎', color: '#6B7280' },
};

export interface DiaryEntry {
  id: string;
  date: Date;
  title: string;
  content: string;
  images: string[]; // Array of image URIs
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  // Layout settings
  layout?: 'grid' | 'masonry' | 'magazine';
  textPosition?: 'top' | 'middle' | 'bottom';
  imageShape?: 'square' | 'circle' | 'landscape';
  textOverlay?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoAsset {
  uri: string;
  width: number;
  height: number;
  type?: string;
  creationTime?: number;
}

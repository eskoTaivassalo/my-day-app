export interface DiaryEntry {
  id: string;
  date: Date;
  title: string;
  content: string;
  images: string[]; // Array of image URIs
  videos?: string[]; // Array of video URIs
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  shared?: boolean; // Indicates if the entry has been shared
  // Layout settings
  layout?: 'grid' | 'masonry' | 'magazine' | 'full' | 'framed' | 'overlay';
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

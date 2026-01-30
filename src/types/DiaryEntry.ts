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

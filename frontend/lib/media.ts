export type MediaType = "image" | "video" | "audio";

export type GetMediaResponse = {
  total: number;
  media: MediaFile[];
};

export type MediaFile = {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  size: number;
  mimeType: string;
  duration?: number;
};

export type UploadMediaResponse = {
  message: string;
  media: MediaFile[];
};
export interface ReviewUserInfo {
  id: number;
  firstName: string | null;
  lastName: string | null;
  avatar: {
    thumb: string | null;
    medium: string | null;
  } | null;
}

export interface ReviewReply {
  id: number;
  text: string;
  createdAt: Date;
  user: ReviewUserInfo | null;
  isAdminReply: boolean;
}

export interface ReviewItem {
  id: number;
  parentId: number | null;
  depth: number;
  rating: number | null;
  text: string;
  status: string;
  createdAt: Date;
  editedAt: Date | null;
  user: ReviewUserInfo;
  media: ReviewMediaItem[];
  likesCount: number;
  likedByMe: boolean;
  isAdminReply: boolean;
  replies: ReviewItem[];
}

export interface ReviewLikeResponse {
  liked: boolean;
  likesCount: number;
}

export interface ReviewsResponse {
  items: ReviewItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface CreateReviewResponse extends ReviewItem {
  message: string;
}

export interface ReviewMediaItem {
  id: number;
  mediaType: 'IMAGE' | 'VIDEO';
  file: {
    id: number;
    s3Key: string;
    s3KeyThumb: string | null;
    s3KeyMedium: string | null;
    s3KeyLarge: string | null;
  };
}

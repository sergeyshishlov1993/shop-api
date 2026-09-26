export interface CartOwner {
  userId: number | null;
  sessionId: string | null;
  isGuest: boolean;
}

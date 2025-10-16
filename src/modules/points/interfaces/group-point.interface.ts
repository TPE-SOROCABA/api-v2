export interface GroupPoint {
  id: string;
  pointId: string;
  pointName: string;
  cartName: string;
  minParticipants: number;
  maxParticipants: number;
  status: boolean;
  groupId: string;
  locationPhoto: string | null;
}
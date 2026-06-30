import { FileData, UserProfile } from './lib/db';

export interface TransferRecord {
  id: string;
  fileName: string;
  fileSize: number;
  direction: 'incoming' | 'outgoing';
  sender: string;
  receiver: string;
  method: string;
  status: 'Completed' | 'Failed' | 'In Progress';
  timestamp: number;
  errorMessage?: string;
}

export interface FileShareRequest {
  id: string;
  fileId: number;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  fileDataBase64?: string;
  senderId: number;
  senderName: string;
  note: string;
  integrityHash: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface StoragePoint {
  date: Date;
  media: number;
  documents: number;
  archives: number;
}

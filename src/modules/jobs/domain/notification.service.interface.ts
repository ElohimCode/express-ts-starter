export interface NotificationPayload {
  recipient: string;
  title: string;
  message: string;
  channel?: 'email' | 'in_app' | 'sms';
}

export interface INotificationService {
  send(payload: NotificationPayload): Promise<{ delivered: boolean; messageId: string }>;
}

import { randomUUID } from 'node:crypto';
import {
  INotificationService,
  NotificationPayload,
} from '../domain/notification.service.interface.js';
import { logger } from '../../../config/logger.js';

export function createLoggerNotificationService(): INotificationService {
  async function send(
    payload: NotificationPayload
  ): Promise<{ delivered: boolean; messageId: string }> {
    const messageId = `msg_${randomUUID()}`;

    logger.info(
      {
        messageId,
        recipient: payload.recipient,
        channel: payload.channel || 'email',
        title: payload.title,
      },
      'Notification dispatched successfully via logger adapter'
    );

    return {
      delivered: true,
      messageId,
    };
  }

  return {
    send,
  };
}

export class LoggerNotificationService implements INotificationService {
  private service: INotificationService = createLoggerNotificationService();
  send(payload: NotificationPayload) {
    return this.service.send(payload);
  }
}

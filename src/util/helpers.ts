import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { xdgDataHome } from './xdg.js';

/**
 * Checks if the certificate is expiring soon (within the next 3 days)
 * @param expiryDate The expiration date of the certificate
 * @returns True if the certificate is expiring within the next 3 days, false otherwise
 */
export function expiresSoon(expiryDate: Date): boolean {
  const now = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(now.getDate() + 3);

  if (expiryDate < threeDaysFromNow) {
    return true;
  }
  return false;
}

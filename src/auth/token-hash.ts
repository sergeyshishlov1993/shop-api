import { createHash } from 'crypto';

// Refresh/reset токени — випадкові UUID (122 біти ентропії), тож bcrypt не потрібен:
// детермінований SHA-256 дає пошук по унікальному індексу замість перебору всіх сесій.
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

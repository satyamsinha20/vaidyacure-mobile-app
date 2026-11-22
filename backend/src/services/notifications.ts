import { AppNotification } from '../models/AppNotification.js';

const CATEGORY_LABELS: Record<string, string> = {
  herbs: 'herb',
  allopathic: 'allopathic medicine',
  homeopathy: 'homeopathic remedy',
  ayurveda: 'Ayurvedic remedy',
  oils: 'oil',
  flowers: 'flower remedy',
  supplements: 'supplement',
  'first-aid': 'first-aid guide',
  firstaid: 'first-aid guide',
  wellness: 'wellness remedy',
};

const labelFor = (category: string) => CATEGORY_LABELS[category?.toLowerCase()] ?? 'remedy';

/**
 * Adds an entry to the app's notification feed. Never throws: a failed
 * notification must not fail the admin's save.
 */
export const notifyRemedyChange = async (
  kind: 'added' | 'updated',
  remedy: { _id: unknown; name: string; category: string; excerpt?: string }
): Promise<void> => {
  try {
    const label = labelFor(remedy.category);
    await AppNotification.create({
      type: kind === 'added' ? 'remedy_added' : 'remedy_updated',
      title: kind === 'added' ? `New ${label}: ${remedy.name}` : `Updated: ${remedy.name}`,
      body: (remedy.excerpt || (kind === 'added' ? `Now available in the ${label} section.` : 'Information has been updated.')).slice(0, 300),
      category: remedy.category,
      remedyId: remedy._id,
    });
  } catch (error) {
    console.error('[notifications] could not create notification:', error instanceof Error ? error.message : error);
  }
};

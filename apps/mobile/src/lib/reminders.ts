import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import type { GroceryAisle } from '../data/mock';
import { line, t, tx } from '../i18n';

// Sends the grocery list to Apple Reminders so it can be checked off in the app people already shop with.
// Kelmi keeps its own list, "Kelmi Groceries", and never reads or changes any other reminder list.
// The list name is never translated: it is how Kelmi finds its own list again. Item titles are in the language on screen.
// iOS only: Android has no Reminders app, so callers hide the button there.

export const remindersAvailable = Platform.OS === 'ios';

const LIST_NAME = 'Kelmi Groceries';
const LIST_COLOR = '#1F7A4D';

export type RemindersResult =
  | { status: 'ok'; added: number; alreadyThere: number }
  | { status: 'nothing' }
  | { status: 'denied'; canAskAgain: boolean };

// Finds the Kelmi list, or creates it on the same account as the person's other reminder lists (iCloud when they use it).
async function kaviList(): Promise<string> {
  const lists = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
  const existing = lists.find((l) => l.title === LIST_NAME && l.allowsModifications);
  if (existing) return existing.id;

  const home = lists.find((l) => l.allowsModifications && l.source);
  if (!home) throw new Error(t('Reminders has no list Kelmi can add to. Open Reminders and make a list first.'));
  return Calendar.createCalendarAsync({
    title: LIST_NAME,
    name: LIST_NAME,
    color: LIST_COLOR,
    entityType: Calendar.EntityTypes.REMINDER,
    sourceId: home.source.id,
    source: home.source,
  });
}

// Adds every item not yet checked off, as one reminder each with its aisle and price in the notes.
// Items already waiting in the Kelmi list are skipped, so sending twice does not double the list.
export async function sendToReminders(aisles: GroceryAisle[], checked: Record<string, boolean>): Promise<RemindersResult> {
  const items = aisles.flatMap((a) => a.items.filter((i) => !checked[i.key]).map((i) => ({ ...i, aisle: a.name })));
  if (items.length === 0) return { status: 'nothing' };

  let permission = await Calendar.getRemindersPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await Calendar.requestRemindersPermissionsAsync();
  if (!permission.granted) return { status: 'denied', canAskAgain: permission.canAskAgain };

  const listId = await kaviList();
  const waiting = await Calendar.getRemindersAsync([listId], null, null, null);
  const have = new Set(waiting.filter((r) => !r.completed).map((r) => (r.title ?? '').trim().toLowerCase()));

  // Skips items already waiting, whether they were sent in this language or in English.
  const fresh = items
    .map((i) => ({ ...i, title: line(i.name) }))
    .filter((i) => !have.has(i.title.trim().toLowerCase()) && !have.has(i.name.trim().toLowerCase()));
  // A few at a time: the system Reminders store handles them quickly but not all at once.
  for (let i = 0; i < fresh.length; i += 8) {
    await Promise.all(
      fresh.slice(i, i + 8).map((item) =>
        Calendar.createReminderAsync(listId, {
          title: item.title,
          notes: t('{aisle} · about {price}', { aisle: tx(item.aisle), price: `$${item.price.toFixed(2)}` }),
        }),
      ),
    );
  }
  return { status: 'ok', added: fresh.length, alreadyThere: items.length - fresh.length };
}

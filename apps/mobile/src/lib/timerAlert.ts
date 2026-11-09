import * as Notifications from 'expo-notifications';

// Apps can't add to the Clock app's timers, so a cook-mode timer is a local notification instead: it rings with the screen
// locked or Kelmi closed, which a Clock timer would do too. Local notifications need no server and send nothing off the phone.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function scheduleTimerAlert(seconds: number, title: string, body: string): Promise<string | null> {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)) },
    });
  } catch {
    return null;
  }
}

export function cancelTimerAlert(id: string | null | undefined) {
  if (id) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

// The Sunday plan reminder: one repeating local notification at 5 PM, with a fixed id so it is never doubled and can be
// found again after a restart. Returns false when the person has not allowed notifications.
const SUNDAY_ID = 'kavi-sunday-plan';

export async function setSundayReminder(on: boolean, title: string, body: string): Promise<boolean> {
  try {
    await Notifications.cancelScheduledNotificationAsync(SUNDAY_ID).catch(() => {});
    if (!on) return true;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;
    await Notifications.scheduleNotificationAsync({
      identifier: SUNDAY_ID,
      content: { title, body, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 17, minute: 0 },
    });
    return true;
  } catch {
    return false;
  }
}

export async function sundayReminderIsOn(): Promise<boolean> {
  try {
    return (await Notifications.getAllScheduledNotificationsAsync()).some((n) => n.identifier === SUNDAY_ID);
  } catch {
    return false;
  }
}

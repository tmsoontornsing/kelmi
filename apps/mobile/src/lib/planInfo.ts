import AsyncStorage from '@react-native-async-storage/async-storage';

// Which planner made the current week, remembered on the phone because the week itself is loaded from the database and
// carries no record of it. Keyed by account, and only used when it matches the week on screen.
export type PlanInfo = { weekStart: string; planner: 'claude' | 'idunify' | 'basic'; degraded: boolean };

const key = (userId: string) => `kavi.planInfo.${userId}`;

export async function savePlanInfo(userId: string, info: PlanInfo) {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(info));
  } catch {}
}

export async function loadPlanInfo(userId: string): Promise<PlanInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const v = raw ? (JSON.parse(raw) as PlanInfo) : null;
    return v && typeof v.weekStart === 'string' && ['claude', 'idunify', 'basic'].includes(v.planner) ? v : null;
  } catch {
    return null;
  }
}

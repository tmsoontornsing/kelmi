import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';

// Kelmi opens in light mode. Someone who wants dark, or wants it to follow the phone, picks that in Settings under
// Appearance, and the choice is remembered. Until a choice is saved the app is light, whatever the phone is set to.
export type AppearanceChoice = 'light' | 'dark' | 'system';

export const DEFAULT_APPEARANCE: AppearanceChoice = 'light';
const STORAGE_KEY = 'kelmi.appearance';
const listeners = new Set<(c: AppearanceChoice) => void>();
let current: AppearanceChoice = DEFAULT_APPEARANCE;

const valid = (v: unknown): v is AppearanceChoice => v === 'light' || v === 'dark' || v === 'system';

// Tells the operating system which look the app wants, which also makes the keyboard, alerts and the status bar match.
// 'unspecified' hands the decision back to the phone.
function apply(choice: AppearanceChoice) {
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

// Called once when the app starts: applies the default straight away, then the saved choice when it has been read.
export function startAppearance() {
  apply(current);
  AsyncStorage.getItem(STORAGE_KEY)
    .then((saved) => {
      if (valid(saved) && saved !== current) setAppearance(saved, false);
    })
    .catch(() => {});
}

export function setAppearance(choice: AppearanceChoice, save = true) {
  current = choice;
  apply(choice);
  listeners.forEach((l) => l(choice));
  if (save) AsyncStorage.setItem(STORAGE_KEY, choice).catch(() => {});
}

export function useAppearance(): AppearanceChoice {
  const [choice, setChoice] = useState(current);
  useEffect(() => {
    listeners.add(setChoice);
    setChoice(current);
    return () => {
      listeners.delete(setChoice);
    };
  }, []);
  return choice;
}

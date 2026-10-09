import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { browserTimeZone, getDisplayTimeZone, readTimeZonePreference, setStoredTimeZonePreference } from './time-zone';

interface DisplayPreferences {
  /** Resolved IANA zone. Changing it only changes how dates are presented. */
  timeZone: string;
  /** 'auto' follows the browser, otherwise an explicit IANA zone. */
  preference: string;
  setTimeZone: (preference: string) => void;
}

const Context = createContext<DisplayPreferences>({
  timeZone: getDisplayTimeZone(), preference: readTimeZonePreference(), setTimeZone: () => {},
});

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readTimeZonePreference);
  const setTimeZone = useCallback((next: string) => {
    // Save before rerender so non-context date helpers read the same preference.
    setPreference(setStoredTimeZonePreference(next));
  }, []);
  const timeZone = preference === 'auto' ? browserTimeZone() : preference;
  const value = useMemo(() => ({ timeZone, preference, setTimeZone }), [timeZone, preference, setTimeZone]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useDisplayPreferences = () => useContext(Context);

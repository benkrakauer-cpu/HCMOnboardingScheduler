import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { api } from './lib/api';
import type { Person, MeetingTemplate, Room, Pattern, Settings } from './lib/types';

interface DataState {
  people: Person[];
  templates: MeetingTemplate[];
  rooms: Room[];
  patterns: Pattern[];
  settings: Settings;
  loading: boolean;
  error: string | null;
  reloadPeople: () => Promise<void>;
  reloadTemplates: () => Promise<void>;
  reloadRooms: () => Promise<void>;
  reloadPatterns: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  reloadAll: () => Promise<void>;
  personById: (id: string) => Person | undefined;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [templates, setTemplates] = useState<MeetingTemplate[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [settings, setSettings] = useState<Settings>({ organizerEmail: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadPeople = useCallback(async () => {
    setPeople(await api.list<Person>('directory'));
  }, []);
  const reloadTemplates = useCallback(async () => {
    setTemplates(await api.list<MeetingTemplate>('templates'));
  }, []);
  const reloadRooms = useCallback(async () => {
    const r = await api.list<Room>('rooms');
    r.sort((a, b) => a.name.localeCompare(b.name));
    setRooms(r);
  }, []);
  const reloadPatterns = useCallback(async () => {
    setPatterns(await api.list<Pattern>('patterns'));
  }, []);
  const reloadSettings = useCallback(async () => {
    setSettings(await api.getSettings());
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        reloadPeople(),
        reloadTemplates(),
        reloadRooms(),
        reloadPatterns(),
        reloadSettings(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [reloadPeople, reloadTemplates, reloadRooms, reloadPatterns, reloadSettings]);

  const personById = useCallback(
    (id: string) => people.find((p) => p.id === id),
    [people],
  );

  const value: DataState = {
    people,
    templates,
    rooms,
    patterns,
    settings,
    loading,
    error,
    reloadPeople,
    reloadTemplates,
    reloadRooms,
    reloadPatterns,
    reloadSettings,
    reloadAll,
    personById,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

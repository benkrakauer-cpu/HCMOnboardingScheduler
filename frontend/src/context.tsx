import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { api } from './lib/api';
import type { Person, MeetingTemplate, Room, Pattern, Organizer } from './lib/types';

interface DataState {
  people: Person[];
  templates: MeetingTemplate[];
  rooms: Room[];
  patterns: Pattern[];
  organizers: Organizer[];
  loading: boolean;
  error: string | null;
  reloadPeople: () => Promise<void>;
  reloadTemplates: () => Promise<void>;
  reloadRooms: () => Promise<void>;
  reloadPatterns: () => Promise<void>;
  reloadOrganizers: () => Promise<void>;
  reloadAll: () => Promise<void>;
  personById: (id: string) => Person | undefined;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [templates, setTemplates] = useState<MeetingTemplate[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
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
  const reloadOrganizers = useCallback(async () => {
    const o = await api.list<Organizer>('organizers');
    o.sort((a, b) => a.displayName.localeCompare(b.displayName));
    setOrganizers(o);
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
        reloadOrganizers(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [reloadPeople, reloadTemplates, reloadRooms, reloadPatterns, reloadOrganizers]);

  const personById = useCallback(
    (id: string) => people.find((p) => p.id === id),
    [people],
  );

  const value: DataState = {
    people,
    templates,
    rooms,
    patterns,
    organizers,
    loading,
    error,
    reloadPeople,
    reloadTemplates,
    reloadRooms,
    reloadPatterns,
    reloadOrganizers,
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

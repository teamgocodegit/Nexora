import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export interface Hackathon {
  id: string;
  name: string;
  description?: string;
  venue?: string;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'ACTIVE' | 'ENDED';
  mode: 'PREDEFINED' | 'ON_SPOT';
  maxTeams?: number;
  slug?: string;
  registrationOpen?: string;
  registrationDeadline?: string;
  minTeamSize: number;
  maxTeamSize: number;
  approvalRequired: boolean;
  waitlistEnabled: boolean;
  createdAt: string;
  _count?: { teams: number };
}

interface HackathonState {
  hackathons: Hackathon[];
  activeHackathon: Hackathon | null;
  loading: boolean;
  error: string | null;
  fetchHackathons: () => Promise<void>;
  setActiveHackathon: (h: Hackathon) => void;
  createHackathon: (data: Partial<Hackathon>) => Promise<Hackathon>;
  updateHackathon: (id: string, data: Partial<Hackathon>) => Promise<void>;
  deleteHackathon: (id: string) => Promise<void>;
}

export const useHackathonStore = create<HackathonState>()(
  persist(
    (set, get) => ({
      hackathons: [],
      activeHackathon: null,
      loading: false,
      error: null,

      fetchHackathons: async () => {
        set({ loading: true, error: null });
        try {
          const hackathons = await api.get<Hackathon[]>('/hackathons');
          set({ hackathons, loading: false });
          const current = get().activeHackathon;
          if (!current && hackathons.length > 0) {
            const active =
              hackathons.find((h) => h.status === 'ACTIVE') || hackathons[0];
            set({ activeHackathon: active });
          } else if (current) {
            const refreshed = hackathons.find((h) => h.id === current.id);
            if (refreshed) set({ activeHackathon: refreshed });
          }
        } catch (err: any) {
          set({ loading: false, error: err.message });
        }
      },

      setActiveHackathon: (activeHackathon) => set({ activeHackathon }),

      createHackathon: async (data) => {
        const h = await api.post<Hackathon>('/hackathons', data);
        set((s) => ({
          hackathons: [h, ...s.hackathons],
          activeHackathon: h,
        }));
        return h;
      },

      updateHackathon: async (id, data) => {
        const h = await api.patch<Hackathon>(`/hackathons/${id}`, data);
        set((s) => ({
          hackathons: s.hackathons.map((x) => (x.id === id ? h : x)),
          activeHackathon:
            s.activeHackathon?.id === id ? h : s.activeHackathon,
        }));
      },

      deleteHackathon: async (id) => {
        await api.delete(`/hackathons/${id}`);
        set((s) => ({
          hackathons: s.hackathons.filter((h) => h.id !== id),
          activeHackathon:
            s.activeHackathon?.id === id
              ? s.hackathons.find((h) => h.id !== id) ?? null
              : s.activeHackathon,
        }));
      },
    }),
    {
      name: 'nexora-hackathon',
      partialize: (s) => ({ activeHackathon: s.activeHackathon }),
    }
  )
);

import { createContext, useContext, useMemo, useState, useEffect } from 'react';

// ==================== TYPES ====================

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: number;
  code: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  color: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Collaborator {
  id: number;
  user_id: number;
  phone?: string;
  notes?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  email?: string;
  name?: string;
  role?: string;
  avatar_url?: string;
}

export interface Costume {
  id: number;
  name: string;
  description?: string;
  size?: string;
  event_id?: number;
  image_url?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  event_title?: string;
  event_code?: string;
}

export interface Material {
  id: number;
  name: string;
  description?: string;
  quantity: number;
  event_id?: number;
  image_url?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  event_title?: string;
  event_code?: string;
}

export interface Availability {
  id: number;
  collaborator_id: number;
  event_id: number;
  is_available: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  collaborator_name?: string;
  event_title?: string;
  event_code?: string;
}

export interface Assignment {
  id: number;
  collaborator_id: number;
  event_id: number;
  costume_id?: number;
  material_id?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  collaborator_name?: string;
  event_title?: string;
  costume_name?: string;
  material_name?: string;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  is_read: number;
  created_at: string;
  user_name?: string;
}

// ==================== API HELPERS ====================

const API_BASE = '/api';

async function apiGet<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data as T;
}

async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data as T;
}

async function apiPut<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data as T;
}

// ==================== CONTEXT ====================

interface DemoContextType {
  // Auth
  currentUser: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  
  // Data
  users: User[];
  events: Event[];
  collaborators: Collaborator[];
  costumes: Costume[];
  materials: Material[];
  availability: Availability[];
  assignments: Assignment[];
  notifications: Notification[];
  
  // Actions - Events
  addEvent: (event: Omit<Event, 'id' | 'created_at' | 'updated_at' | 'is_active'>) => Promise<Event>;
  updateEvent: (id: number, updates: Partial<Event>) => Promise<Event>;
  
  // Actions - Collaborators
  addCollaborator: (name: string, email: string, password: string, phone?: string, notes?: string) => Promise<{user: User, collaborator: Collaborator}>;
  
  // Actions - Costumes
  addCostume: (costume: Omit<Costume, 'id' | 'created_at' | 'updated_at' | 'is_active'>) => Promise<Costume>;
  
  // Actions - Materials
  addMaterial: (material: Omit<Material, 'id' | 'created_at' | 'updated_at' | 'is_active'>) => Promise<Material>;
  
  // Actions - Availability
  setAvailability: (collaborator_id: number, event_id: number, is_available: number, notes?: string) => Promise<Availability>;
  
  // Actions - Assignments
  addAssignment: (assignment: Omit<Assignment, 'id' | 'created_at' | 'updated_at'>) => Promise<Assignment>;
}

const DemoContext = createContext<DemoContextType | null>(null);

export function useDemoContext() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemoContext must be used within DemoProvider');
  return ctx;
}

// ==================== PROVIDER ====================

export function DemoProvider({ children }: { children: React.ReactNode }) {
  // State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [availability, setAvailabilityData] = useState<Availability[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);

  // Load all data on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [eventsData, collaboratorsData, costumesData, materialsData, availabilityData, assignmentsData] = await Promise.all([
          apiGet<{ events: Event[] }>('/api/events').then(r => r.events),
          apiGet<{ collaborators: Collaborator[] }>('/api/collaborators').then(r => r.collaborators),
          apiGet<{ costumes: Costume[] }>('/api/costumes').then(r => r.costumes),
          apiGet<{ materials: Material[] }>('/api/materials').then(r => r.materials),
          apiGet<{ availability: Availability[] }>('/api/availability').then(r => r.availability),
          apiGet<{ assignments: Assignment[] }>('/api/assignments').then(r => r.assignments),
        ]);
        
        setEvents(eventsData);
        setCollaborators(collaboratorsData);
        setCostumes(costumesData);
        setMaterials(materialsData);
        setAvailabilityData(availabilityData);
        setAssignments(assignmentsData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadData();
  }, []);

  // Load notifications when user logs in
  useEffect(() => {
    if (!currentUser) return;
    
    apiGet<{ notifications: Notification[] }>(`/api/notifications/${currentUser.id}`)
      .then(r => setNotifications(r.notifications))
      .catch(console.error);
  }, [currentUser]);

  // Actions
  const login = async (email: string, password: string): Promise<User> => {
    const { user } = await apiPost<{ user: User }>('/api/auth/login', { email, password });
    setCurrentUser(user);
    return user;
  };

  const logout = () => {
    setCurrentUser(null);
    setNotifications([]);
  };

  const addEvent = async (eventData: Omit<Event, 'id' | 'created_at' | 'updated_at' | 'is_active'>): Promise<Event> => {
    const { event } = await apiPost<{ event: Event }>('/api/events', eventData);
    setEvents(prev => [...prev, event]);
    return event;
  };

  const updateEvent = async (id: number, updates: Partial<Event>): Promise<Event> => {
    const { event } = await apiPut<{ event: Event }>(`/api/events/${id}`, updates);
    setEvents(prev => prev.map(e => e.id === id ? event : e));
    return event;
  };

  const addCollaborator = async (
    name: string,
    email: string,
    password: string,
    phone?: string,
    notes?: string
  ): Promise<{user: User, collaborator: Collaborator}> => {
    // Crea prima l'utente
    const { user } = await apiPost<{ user: User }>('/api/auth/register', {
      email,
      password,
      name,
      role: 'user'
    });
    
    // Poi crea il collaboratore
    const { collaborator } = await apiPost<{ collaborator: Collaborator }>('/api/collaborators', {
      user_id: user.id,
      phone,
      notes
    });
    
    setUsers(prev => [...prev, user]);
    setCollaborators(prev => [...prev, collaborator]);
    
    return { user, collaborator };
  };

  const addCostume = async (costumeData: Omit<Costume, 'id' | 'created_at' | 'updated_at' | 'is_active'>): Promise<Costume> => {
    const { costume } = await apiPost<{ costume: Costume }>('/api/costumes', costumeData);
    setCostumes(prev => [...prev, costume]);
    return costume;
  };

  const addMaterial = async (materialData: Omit<Material, 'id' | 'created_at' | 'updated_at' | 'is_active'>): Promise<Material> => {
    const { material } = await apiPost<{ material: Material }>('/api/materials', materialData);
    setMaterials(prev => [...prev, material]);
    return material;
  };

  const setAvailability = async (
    collaborator_id: number,
    event_id: number,
    is_available: number,
    notes?: string
  ): Promise<Availability> => {
    const { availability: newAvailability } = await apiPost<{ availability: Availability }>('/api/availability', {
      collaborator_id,
      event_id,
      is_available,
      notes
    });
    
    setAvailabilityData(prev => {
      const existing = prev.find(a => a.collaborator_id === collaborator_id && a.event_id === event_id);
      if (existing) {
        return prev.map(a => a.collaborator_id === collaborator_id && a.event_id === event_id ? newAvailability : a);
      }
      return [...prev, newAvailability];
    });
    
    return newAvailability;
  };

  const addAssignment = async (assignmentData: Omit<Assignment, 'id' | 'created_at' | 'updated_at'>): Promise<Assignment> => {
    const { assignment } = await apiPost<{ assignment: Assignment }>('/api/assignments', assignmentData);
    setAssignments(prev => [...prev, assignment]);
    return assignment;
  };

  const value = useMemo<DemoContextType>(() => ({
    currentUser,
    login,
    logout,
    users,
    events,
    collaborators,
    costumes,
    materials,
    availability,
    assignments,
    notifications,
    addEvent,
    updateEvent,
    addCollaborator,
    addCostume,
    addMaterial,
    setAvailability,
    addAssignment,
  }), [currentUser, users, events, collaborators, costumes, materials, availability, assignments, notifications]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Caricamento...</div>;
  }

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

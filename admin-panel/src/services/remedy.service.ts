import Cookies from "js-cookie";
import { APP_CONFIG } from "@/lib/constants";
import { RemedyItem } from "@/components/remedies/RemedyCategoryView";

const API_BASE = APP_CONFIG.API_BASE_URL;

// Writes need the admin session token (the backend rejects anonymous changes)
const authHeaders = (): Record<string, string> => {
  const token = Cookies.get(APP_CONFIG.COOKIE_TOKEN_KEY);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const remedyService = {
  /**
   * Fetch remedies for a category from MongoDB backend, with localStorage fallback/cache
   */
  async getRemedies(category: string): Promise<RemedyItem[]> {
    const storageKey = `vaidya_remedies_items_${category.toLowerCase()}`;

    // 1. Try to fetch from MongoDB Backend API
    try {
      // fresh=1: the backend skips the CDN cache, so admins always see their latest edits
      const res = await fetch(`${API_BASE}/remedies?category=${encodeURIComponent(category.toLowerCase())}&fresh=1`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success" && Array.isArray(json.data)) {
          const items: RemedyItem[] = json.data;
          // Sync to localStorage
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(storageKey, JSON.stringify(items));
            } catch {}
          }
          return items;
        }
      }
    } catch (err) {
      console.warn("Could not connect to remedies API, using local cache:", err);
    }

    // 2. Fallback to localStorage cache
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch {}
    }

    return [];
  },

  /**
   * Create a new remedy in MongoDB and update local cache
   */
  async createRemedy(category: string, remedyData: Partial<RemedyItem>): Promise<RemedyItem | null> {
    const storageKey = `vaidya_remedies_items_${category.toLowerCase()}`;

    try {
      const res = await fetch(`${API_BASE}/remedies`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ ...remedyData, category: category.toLowerCase() }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.status === "success" && json.data) {
          const created: RemedyItem = json.data;

          // Update local cache
          if (typeof window !== "undefined") {
            try {
              const existingStr = localStorage.getItem(storageKey);
              const existing: RemedyItem[] = existingStr ? JSON.parse(existingStr) : [];
              const updated = [created, ...existing.filter((i) => i.id !== created.id)];
              localStorage.setItem(storageKey, JSON.stringify(updated));
            } catch {}
          }

          return created;
        }
      }
    } catch (err) {
      console.warn("Backend create remedy error:", err);
    }

    // Offline / Local fallback if backend is unreachable
    if (typeof window !== "undefined") {
      try {
        const localItem: RemedyItem = {
          id: `${category}-${Date.now()}`,
          name: remedyData.name || "",
          category: category.toLowerCase(),
          excerpt: remedyData.excerpt || "",
          description: remedyData.description || "",
          imageUrl: remedyData.imageUrl || "",
          symptoms: remedyData.symptoms || [],
          uses: remedyData.uses || [],
          precautions: remedyData.precautions || "",
          dosage: remedyData.dosage || "",
          preparation: remedyData.preparation || "",
          variety: remedyData.variety || "",
          habitat: remedyData.habitat || "",
          lifespan: remedyData.lifespan || "",
          notes: remedyData.notes || "",
          status: remedyData.status || "Draft",
          addedOn: remedyData.addedOn || new Date().toLocaleDateString("en-GB"),
          addedBy: remedyData.addedBy || "Admin",
        };
        const existingStr = localStorage.getItem(storageKey);
        const existing: RemedyItem[] = existingStr ? JSON.parse(existingStr) : [];
        const updated = [localItem, ...existing];
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return localItem;
      } catch {}
    }

    return null;
  },

  /**
   * Update an existing remedy in MongoDB and local cache
   */
  async updateRemedy(id: string, category: string, remedyData: Partial<RemedyItem>): Promise<boolean> {
    const storageKey = `vaidya_remedies_items_${category.toLowerCase()}`;

    // 1. Try to update via MongoDB API
    try {
      const res = await fetch(`${API_BASE}/remedies/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(remedyData),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.status === "success" && json.data) {
          // Sync local storage
          if (typeof window !== "undefined") {
            try {
              const existingStr = localStorage.getItem(storageKey);
              if (existingStr) {
                const items: RemedyItem[] = JSON.parse(existingStr);
                const updated = items.map((i) => (i.id === id ? { ...i, ...json.data } : i));
                localStorage.setItem(storageKey, JSON.stringify(updated));
              }
            } catch {}
          }
          return true;
        }
      }
    } catch (err) {
      console.warn("Backend update remedy error:", err);
    }

    // 2. Fallback to localStorage update
    if (typeof window !== "undefined") {
      try {
        const existingStr = localStorage.getItem(storageKey);
        if (existingStr) {
          const items: RemedyItem[] = JSON.parse(existingStr);
          const updated = items.map((i) => (i.id === id ? { ...i, ...remedyData } : i));
          localStorage.setItem(storageKey, JSON.stringify(updated));
          return true;
        }
      } catch {}
    }

    return false;
  },

  /**
   * Delete a remedy from MongoDB and local cache
   */
  async deleteRemedy(id: string, category: string): Promise<boolean> {
    const storageKey = `vaidya_remedies_items_${category.toLowerCase()}`;

    // 1. Try to delete via MongoDB API
    try {
      await fetch(`${API_BASE}/remedies/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch (err) {
      console.warn("Backend delete remedy error:", err);
    }

    // 2. Remove from local cache
    if (typeof window !== "undefined") {
      try {
        const existingStr = localStorage.getItem(storageKey);
        if (existingStr) {
          const items: RemedyItem[] = JSON.parse(existingStr);
          const updated = items.filter((i) => i.id !== id);
          localStorage.setItem(storageKey, JSON.stringify(updated));
        }
      } catch {}
    }

    return true;
  },
};

import { serverFn } from "@tanstack/react-start/server";

export interface LibraryItem {
  id: string;
  title: string;
  kind: "dizi" | "film" | "canli";
  stream_url: string;
  thumbnail?: string;
  episode?: number;
  episode_name?: string;
  season?: number;
  year?: number;
  is_alive: boolean;
}

// In-memory storage for demo purposes
let libraryStorage: LibraryItem[] = [
  {
    id: "1",
    title: "Örnek Dizi",
    kind: "dizi",
    stream_url: "https://example.com/stream1.m3u8",
    thumbnail: "https://via.placeholder.com/300x200?text=Dizi",
    episode: 1,
    episode_name: "Pilot",
    season: 1,
    is_alive: true,
  },
  {
    id: "2",
    title: "Örnek Film",
    kind: "film",
    stream_url: "https://example.com/stream2.mp4",
    thumbnail: "https://via.placeholder.com/300x200?text=Film",
    year: 2024,
    is_alive: true,
  },
];

export const listLibrary = serverFn(
  async (): Promise<{ items: LibraryItem[] }> => {
    return {
      items: libraryStorage,
    };
  }
);

export const reverifyLibrary = serverFn(
  async (): Promise<{ checked: number; alive: number }> => {
    let alive = 0;
    
    for (const item of libraryStorage) {
      try {
        const response = await fetch(item.stream_url, {
          method: "HEAD",
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        });
        
        item.is_alive = response.ok;
        if (response.ok) alive++;
      } catch {
        item.is_alive = false;
      }
    }

    return {
      checked: libraryStorage.length,
      alive,
    };
  }
);

export const deleteDeadItems = serverFn(
  async (): Promise<{ ok: boolean; removed: number }> => {
    const before = libraryStorage.length;
    libraryStorage = libraryStorage.filter((item) => item.is_alive);
    const removed = before - libraryStorage.length;

    return {
      ok: true,
      removed,
    };
  }
);
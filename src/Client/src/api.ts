export const getBaseUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const backend = params.get('backend');
  return backend ? backend : window.location.origin;
};

export const BASE_URL = getBaseUrl();

export const api = {
  getFiles: async (): Promise<string[]> => {
    try {
      const response = await fetch(`${BASE_URL}/api/files`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
    return [];
  },
  
  createFile: async (filename: string): Promise<boolean> => {
    try {
      const response = await fetch(`${BASE_URL}/api/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to create file", e);
      return false;
    }
  },

  deleteFile: async (filename: string): Promise<boolean> => {
    try {
      const response = await fetch(`${BASE_URL}/api/files/${encodeURIComponent(filename)}`, {
        method: "DELETE"
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to delete file", e);
      return false;
    }
  },

  getPeers: async (): Promise<any[]> => {
    try {
      const response = await fetch(`${BASE_URL}/api/peers`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error("Failed to fetch peers", e);
    }
    return [];
  },

  connectPeer: (ip: string, port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
        (window as any).external.receiveMessage((message: string) => {
          if (message === "connectSuccess") resolve(true);
        });
        (window as any).external.sendMessage(JSON.stringify({ action: "connectPeer", ip, port }));
      } else {
        // Fallback for non-photino environments
        fetch(`${BASE_URL}/api/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip, port })
        }).then(res => resolve(res.ok)).catch(() => resolve(false));
      }
    });
  },

  getShareInfo: async (): Promise<{ ips: string[], port: number } | null> => {
    try {
      const response = await fetch(`${BASE_URL}/api/share`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error("Failed to fetch share info", e);
    }
    return null;
  }
};

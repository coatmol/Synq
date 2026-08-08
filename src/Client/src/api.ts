export const getBaseUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const backend = params.get('backend');
  return backend ? backend : window.location.origin;
};

export const BASE_URL = getBaseUrl();

const getToken = () => localStorage.getItem("server_password");

const handleResponse = (response: Response) => {
  if (response.status === 401) {
    const pwd = prompt("Authentication required. Please enter the server password:");
    if (pwd !== null) {
      localStorage.setItem("server_password", pwd);
      window.location.reload();
    }
  }
  return response;
};

const fetchWithAuth = async (url: string, options?: RequestInit) => {
  const token = getToken();
  const authUrl = new URL(url);
  if (token) authUrl.searchParams.append("access_token", token);

  const response = await fetch(authUrl.toString(), options);
  return handleResponse(response);
};

export const api = {
  getFiles: async (): Promise<{ files: string[], folders: string[], notebookName?: string }> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/files`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
    return {files: [], folders: []};
  },

  createFile: async (filename: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/files`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({filename})
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to create file", e);
      return false;
    }
  },

  deleteFile: async (filename: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/files/${encodeURIComponent(filename)}`, {
        method: "DELETE"
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to delete file", e);
      return false;
    }
  },

  renameItem: async (oldPath: string, newPath: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/files/rename`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({oldPath, newPath})
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to rename item", e);
      return false;
    }
  },

  createFolder: async (path: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/folders`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path})
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to create folder", e);
      return false;
    }
  },

  deleteFolder: async (path: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/folders/${encodeURIComponent(path)}`, {
        method: "DELETE"
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to delete folder", e);
      return false;
    }
  },

  moveItem: async (oldPath: string, newPath: string): Promise<boolean> => {
    try {
      const response = await fetch(`${BASE_URL}/api/files/rename`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({oldPath, newPath})
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to move item", e);
      return false;
    }
  },

  getDocument: async (filename: string): Promise<string> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/document?filename=${encodeURIComponent(filename)}`);
      if (response.ok) {
        const data = await response.json();
        return data.text;
      }
      return "";
    } catch (e) {
      console.error(e);
      return "";
    }
  },

  openNative: async (path: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/files/open-native`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path})
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to open native", e);
      return false;
    }
  },

  getPeers: async (): Promise<any[]> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/peers`);
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
        (window as any).external.sendMessage(JSON.stringify({action: "connectPeer", ip, port}));
      } else {
        // Fallback for non-photino environments
        fetch(`${BASE_URL}/api/connect`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ip, port})
        }).then(res => resolve(res.ok)).catch(() => resolve(false));
      }
    });
  },

  connectManualPeer: async (peer: { ip: string, port: number, password?: string }): Promise<boolean> => {
    try {
      const response = await fetch(`${BASE_URL}/api/peers/manual`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(peer)
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to connect manual peer", e);
      return false;
    }
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
  },

  getSettings: async (): Promise<{ username: string, password?: string, recentFolders: string[] } | null> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/settings`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error("Failed to fetch settings", e);
    }
    return null;
  },

  getVersion: async (): Promise<string | null> => {
    try {
      const response = await fetch(`${BASE_URL}/api/version`);
      if (response.ok) {
        const data = await response.json();
        return data.version;
      }
    } catch (e) {
      console.error("Failed to fetch version", e);
    }
    return null;
  },

  updateSettings: async (settings: { username: string, password?: string }): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`${BASE_URL}/api/settings`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(settings)
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to update settings", e);
      return false;
    }
  },

  // STUN Diagnostic Status
  getStunStatus: async (): Promise<{
    complete: boolean;
    natType: string;
    canHolePunch: boolean;
    servers: Array<{ url: string; reachable: boolean; latencyMs: number }>;
  }> => {
    const res = await fetch(`${BASE_URL}/api/stun/status`);
    return res.json();
  },

  // WAN Token API
  createWanOffer: async (): Promise<{ token: string, pendingId: string }> => {
    const res = await fetch(`${BASE_URL}/api/wan/create-offer`, {method: 'POST'});
    return res.json();
  },

  acceptWanOffer: async (token: string): Promise<{ token: string }> => {
    const res = await fetch(`${BASE_URL}/api/wan/accept-offer`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token})
    });
    return res.json();
  },

  completeWanHandshake: async (token: string, pendingId: string): Promise<void> => {
    await fetch(`${BASE_URL}/api/wan/complete-handshake`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token, pendingId})
    });
  },

  getWanPeers: async (): Promise<any[]> => {
    try {
      const res = await fetch(`${BASE_URL}/api/wan/peers`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch WAN peers", e);
    }
    return [];
  }
};

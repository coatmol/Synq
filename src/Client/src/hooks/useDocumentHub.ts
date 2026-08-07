import { useEffect, useCallback } from "react";
import * as signalR from "@microsoft/signalr";
import { create } from "zustand";
import { BASE_URL, api } from "../api";

interface DocumentState {
  activeFile: string | null;
  setActiveFile: (file: string | null) => void;
  openFiles: string[];
  setOpenFiles: (files: string[] | ((prev: string[]) => string[])) => void;
  deletedOpenFiles: string[];
  setDeletedOpenFiles: (files: string[] | ((prev: string[]) => string[])) => void;
  text: string;
  setText: (text: string) => void;
  isConnected: boolean;
  setIsConnected: (status: boolean) => void;
  isLoading: boolean;
  setIsLoading: (status: boolean) => void;
  documentStats: { words: number; chars: number; line: number; col: number };
  setDocumentStats: (stats: { words: number; chars: number; line: number; col: number }) => void;
  wanPeers: any[];
  setWanPeers: (peers: any[]) => void;
}

// Per-file document cache so tab switching is instant for already-loaded files.
// Declared before the store so setActiveFile can reference it atomically.
const documentCache = new Map<string, string>();

export const useDocumentStore = create<DocumentState>((set) => ({
  activeFile: null,
  setActiveFile: (file) => set((state) => {
    // Atomically set both activeFile and text from cache in one update,
    // so the editor remounts with the correct content immediately.
    const cached = file ? documentCache.get(file) : undefined;
    const textUpdate = cached !== undefined ? { text: cached } : {};
    if (file && !state.openFiles.includes(file)) {
      return { activeFile: file, openFiles: [...state.openFiles, file], ...textUpdate };
    }
    return { activeFile: file, ...textUpdate };
  }),
  openFiles: [],
  setOpenFiles: (updater) => set((state) => ({ openFiles: typeof updater === 'function' ? updater(state.openFiles) : updater })),
  deletedOpenFiles: [],
  setDeletedOpenFiles: (updater) => set((state) => ({ deletedOpenFiles: typeof updater === 'function' ? updater(state.deletedOpenFiles) : updater })),
  text: "",
  setText: (text) => set({ text }),
  isConnected: false,
  setIsConnected: (status) => set({ isConnected: status }),
  isLoading: false,
  setIsLoading: (status) => set({ isLoading: status }),
  documentStats: { words: 0, chars: 0, line: 1, col: 1 },
  setDocumentStats: (stats) => set({ documentStats: stats }),
  wanPeers: [],
  setWanPeers: (peers) => set({ wanPeers: peers }),
}));

// ─── Singleton SignalR connection ────────────────────────────────────
// Only ONE HubConnection is ever created for the entire app lifetime.
// This is critical: if multiple connections exist, the server's
// Clients.Others broadcast treats the second connection as a separate
// client, causing an echo loop that destroys the cursor during typing.
let singletonConnection: signalR.HubConnection | null = null;
let connectionStarted = false;

function getOrCreateConnection(): signalR.HubConnection {
  if (singletonConnection) return singletonConnection;

  const token = localStorage.getItem("server_password");
  const hubUrl = token ? `${BASE_URL}/hub?access_token=${encodeURIComponent(token)}` : `${BASE_URL}/hub`;

  const newConnection = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl)
    .withAutomaticReconnect()
    .build();

  newConnection.on("DocumentUpdated", (filename: string, newText: string) => {
    documentCache.set(filename, newText);
    const currentActiveFile = useDocumentStore.getState().activeFile;
    if (filename === currentActiveFile) {
      useDocumentStore.getState().setText(newText);
    }
  });

  newConnection.on("ItemRenamed", (oldPath: string, newPath: string) => {
    const { activeFile, openFiles, deletedOpenFiles } = useDocumentStore.getState();
    const updatePath = (p: string) => {
      if (p === oldPath) return newPath;
      if (p.startsWith(oldPath + '/')) return newPath + p.substring(oldPath.length);
      return p;
    };
    const newOpen = openFiles.map(updatePath);
    useDocumentStore.setState({ 
      openFiles: newOpen,
      deletedOpenFiles: deletedOpenFiles.map(updatePath)
    });
    if (activeFile) {
      const updatedActive = updatePath(activeFile);
      if (updatedActive !== activeFile) useDocumentStore.setState({ activeFile: updatedActive });
    }
    window.dispatchEvent(new CustomEvent("refreshFileTree"));
  });

  newConnection.on("ItemMoved", (oldPath: string, newPath: string) => {
    const { activeFile, openFiles, deletedOpenFiles } = useDocumentStore.getState();
    const updatePath = (p: string) => {
      if (p === oldPath) return newPath;
      if (p.startsWith(oldPath + '/')) return newPath + p.substring(oldPath.length);
      return p;
    };
    const newOpen = openFiles.map(updatePath);
    useDocumentStore.setState({ 
      openFiles: newOpen,
      deletedOpenFiles: deletedOpenFiles.map(updatePath)
    });
    if (activeFile) {
      const updatedActive = updatePath(activeFile);
      if (updatedActive !== activeFile) useDocumentStore.setState({ activeFile: updatedActive });
    }
    window.dispatchEvent(new CustomEvent("refreshFileTree"));
  });

  newConnection.on("ItemDeleted", (path: string) => {
    const { openFiles, deletedOpenFiles } = useDocumentStore.getState();
    const isFileAffected = (p: string) => p === path || p.startsWith(path + '/');
    const affectedFiles = openFiles.filter(isFileAffected);
    if (affectedFiles.length > 0) {
      useDocumentStore.setState({
        deletedOpenFiles: [...new Set([...deletedOpenFiles, ...affectedFiles])]
      });
    }
    window.dispatchEvent(new CustomEvent("refreshFileTree"));
  });

  newConnection.on("FolderCreated", () => {
    window.dispatchEvent(new CustomEvent("refreshFileTree"));
  });

  newConnection.on("FileCreated", (path: string) => {
    const { deletedOpenFiles } = useDocumentStore.getState();
    if (deletedOpenFiles.includes(path)) {
      useDocumentStore.setState({
        deletedOpenFiles: deletedOpenFiles.filter(p => p !== path)
      });
    }
    window.dispatchEvent(new CustomEvent("refreshFileTree"));
  });

  newConnection.onreconnecting(() => {
    useDocumentStore.getState().setIsConnected(false);
  });

  newConnection.onreconnected(() => {
    useDocumentStore.getState().setIsConnected(true);
    fetchDocumentImpl();
  });

  singletonConnection = newConnection;
  return newConnection;
}

async function startConnection() {
  if (connectionStarted) return;
  connectionStarted = true;

  const connection = getOrCreateConnection();
  try {
    await connection.start();
    useDocumentStore.getState().setIsConnected(true);
    fetchDocumentImpl();
  } catch (err) {
    console.error("SignalR Connection Error: ", err);
    useDocumentStore.getState().setIsConnected(false);
    connectionStarted = false;
    setTimeout(startConnection, 5000);
  }
}

async function fetchDocumentImpl() {
  const { activeFile, setIsLoading, setText } = useDocumentStore.getState();
  if (!activeFile) return;
  
  // If we have a cached version, use it instantly (no spinner)
  const cached = documentCache.get(activeFile);
  if (cached !== undefined) {
    setText(cached);
  } else {
    // Only show loading spinner for files we've never seen
    setIsLoading(true);
  }

  try {
    const text = await api.getDocument(activeFile);
    documentCache.set(activeFile, text);
    // Only update if this file is still the active one
    if (useDocumentStore.getState().activeFile === activeFile) {
      setText(text);
    }
  } catch (err) {
    console.error("Failed to fetch initial document state", err);
  } finally {
    setIsLoading(false);
  }
}

// ─── Hook ────────────────────────────────────────────────────────────
// Safe to call from multiple components — always reuses the singleton.
export function useDocumentHub() {
  useEffect(() => {
    startConnection();
    // No cleanup — the singleton lives for the app's lifetime
  }, []);

  const insertText = useCallback(async (index: number, value: string) => {
    const activeFile = useDocumentStore.getState().activeFile;
    if (!activeFile) return;
    const conn = singletonConnection;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      if (value.length === 1) {
        await conn.invoke("InsertCharacter", activeFile, index, value);
      } else {
        await conn.invoke("InsertText", activeFile, index, value);
      }
    }
  }, []);

  const deleteText = useCallback(async (index: number, length: number = 1) => {
    const activeFile = useDocumentStore.getState().activeFile;
    if (!activeFile) return;
    const conn = singletonConnection;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      if (length === 1) {
        await conn.invoke("DeleteCharacter", activeFile, index);
      } else {
        await conn.invoke("DeleteText", activeFile, index, length);
      }
    }
  }, []);

  return { insertText, deleteText, fetchDocument: fetchDocumentImpl };
}

import { useEffect, useCallback, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import { create } from "zustand";
import { BASE_URL } from "../api";

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
}

export const useDocumentStore = create<DocumentState>((set) => ({
  activeFile: null,
  setActiveFile: (file) => set((state) => {
    if (file && !state.openFiles.includes(file)) {
      return { activeFile: file, openFiles: [...state.openFiles, file] };
    }
    return { activeFile: file };
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
}));

export function useDocumentHub() {
  const { setText, setIsConnected } = useDocumentStore();
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    const newConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${BASE_URL}/hub`)
      .withAutomaticReconnect()
      .build();

    connectionRef.current = newConnection;

    newConnection.on("DocumentUpdated", (filename: string, newText: string) => {
      const currentActiveFile = useDocumentStore.getState().activeFile;
      if (filename === currentActiveFile) {
        setText(newText);
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
      setIsConnected(false);
    });

    newConnection.onreconnected(() => {
      setIsConnected(true);
      fetchDocument();
    });

    const startConnection = async () => {
      try {
        await newConnection.start();
        setIsConnected(true);
        fetchDocument();
      } catch (err) {
        console.error("SignalR Connection Error: ", err);
        setIsConnected(false);
        setTimeout(startConnection, 5000);
      }
    };

    startConnection();

    return () => {
      newConnection.stop();
      connectionRef.current = null;
    };
  }, [setText, setIsConnected]);

  const fetchDocument = async () => {
    const { activeFile, setIsLoading } = useDocumentStore.getState();
    if (!activeFile) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/document?filename=${encodeURIComponent(activeFile)}`);
      if (response.ok) {
        const data = await response.json();
        setText(data.text);
      }
    } catch (err) {
      console.error("Failed to fetch initial document state", err);
    } finally {
      setIsLoading(false);
    }
  };

  const insertText = useCallback(async (index: number, value: string) => {
    const activeFile = useDocumentStore.getState().activeFile;
    if (!activeFile) return;
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      if (value.length === 1) {
        await connectionRef.current.invoke("InsertCharacter", activeFile, index, value);
      } else {
        await connectionRef.current.invoke("InsertText", activeFile, index, value);
      }
    }
  }, []);

  const deleteText = useCallback(async (index: number, length: number = 1) => {
    const activeFile = useDocumentStore.getState().activeFile;
    if (!activeFile) return;
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      if (length === 1) {
        await connectionRef.current.invoke("DeleteCharacter", activeFile, index);
      } else {
        await connectionRef.current.invoke("DeleteText", activeFile, index, length);
      }
    }
  }, []);

  return { insertText, deleteText, fetchDocument };
}

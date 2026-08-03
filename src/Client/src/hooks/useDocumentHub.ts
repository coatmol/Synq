import { useEffect, useCallback, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import { create } from "zustand";
import { BASE_URL } from "../api";

interface DocumentState {
  activeFile: string | null;
  setActiveFile: (file: string | null) => void;
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
  setActiveFile: (file) => set({ activeFile: file }),
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

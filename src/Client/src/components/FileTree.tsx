import React, {useState, useEffect} from 'react';
import {api} from '../api';
import {useDocumentStore} from '../hooks/useDocumentHub';
import {Dropdown, Modal, Button, Input} from "@heroui/react";
import {Folder, FolderOpen, FileText, Plus, FolderPlus, NotebookIcon, LineSquiggle} from 'lucide-react';

const NodeType = {
  Folder: 0,
  File: 1,
  Excalidraw: 2,
} as const;

type NodeType = typeof NodeType[keyof typeof NodeType];

interface TreeNode {
  name: string;
  path: string;
  type: NodeType;
  children: Record<string, TreeNode>;
}

export function FileTree() {
  const [files, setFiles] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([''])); // empty string is root
  const {setActiveFile, activeFile} = useDocumentStore();
  const [selectedFolder, setSelectedFolder] = useState<string>(''); // For new file/folder creation context
  const [notebookName, setNotebookName] = useState<string>('Notebook');

  const [modalState, setModalState] = useState<{
    type: 'createFile' | 'createFolder' | 'createSketch' | 'rename' | 'delete' | null,
    node?: TreeNode
  }>({type: null});
  const [modalInput, setModalInput] = useState("");
  const [contextMenuNode, setContextMenuNode] = useState<string | null>(null);

  const fetchFiles = async () => {
    const data = await api.getFiles();
    setFiles(data.files || []);
    setFolders(data.folders || []);
    if (data.notebookName) setNotebookName(data.notebookName);
  };

  useEffect(() => {
    fetchFiles();
    const interval = setInterval(fetchFiles, 3000);

    const handleRefresh = () => fetchFiles();

    const handleNewFile = () => {
      setModalInput("");
      setModalState({type: 'createFile'});
    };

    const handleNewSketch = () => {
      setModalInput("");
      setModalState({type: 'createSketch'});
    };

    window.addEventListener("refreshFileTree", handleRefresh);
    window.addEventListener("trigger-new-file", handleNewFile);
    window.addEventListener("trigger-new-sketch", handleNewSketch);

    return () => {
      clearInterval(interval);
      window.removeEventListener("refreshFileTree", handleRefresh);
      window.removeEventListener("trigger-new-file", handleNewFile);
      window.removeEventListener("trigger-new-sketch", handleNewSketch);
    };
  }, []);

  const buildTree = () => {
    const root: TreeNode = {name: 'root', path: '', type: NodeType.Folder, children: {}};

    // Add folders
    folders.forEach(f => {
      const parts = f.split('/');
      let current = root;
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children[part]) {
          current.children[part] = {name: part, path: currentPath, type: NodeType.Folder, children: {}};
        }
        current = current.children[part];
      }
    });

    // Add files
    files.forEach(f => {
      const parts = f.split('/');
      const fileName = parts.pop()!;
      let current = root;
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children[part]) {
          current.children[part] = {name: part, path: currentPath, type: NodeType.Folder, children: {}};
        }
        current = current.children[part];
      }
      if (fileName.endsWith(".excalidraw")) {
        current.children[fileName] = {name: fileName, path: f, type: NodeType.Excalidraw, children: {}};
      } else {
        current.children[fileName] = {name: fileName, path: f, type: NodeType.File, children: {}};
      }
    });

    return root;
  };

  const tree = buildTree();

  const toggleFolder = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const handleCreateFile = () => {
    setModalInput("");
    setModalState({type: 'createFile'});
  };

  const handleCreateSketch = () => {
    setModalInput("");
    setModalState({type: 'createSketch'});
  };

  const handleCreateFolder = () => {
    setModalInput("");
    setModalState({type: 'createFolder'});
  };

  const handleRename = (node: TreeNode) => {
    setContextMenuNode(null);
    setModalInput(node.name);
    setModalState({type: 'rename', node});
  };

  const handleDelete = (node: TreeNode) => {
    setContextMenuNode(null);
    setModalState({type: 'delete', node});
  };

  const handleModalSubmit = async () => {
    const {type, node} = modalState;
    if (type === 'createFile') {
      let name = modalInput.trim();
      if (!name) return;
      if (!name.endsWith('.md')) name += '.md';
      const path = selectedFolder ? `${selectedFolder}/${name}` : name;
      await api.createFile(path);
    }
    if (type === 'createSketch') {
      let name = modalInput.trim();
      if (!name) return;
      if (!name.endsWith('.excalidraw')) name += '.excalidraw';
      const path = selectedFolder ? `${selectedFolder}/${name}` : name;
      await api.createFile(path);
    } else if (type === 'createFolder') {
      const name = modalInput.trim();
      if (!name) return;
      const path = selectedFolder ? `${selectedFolder}/${name}` : name;
      await api.createFolder(path);
    } else if (type === 'rename' && node) {
      const newName = modalInput.trim();
      if (!newName || newName === node.name) return;
      const basePath = node.path.substring(0, node.path.lastIndexOf('/'));
      const newPath = basePath ? (basePath === node.path ? newName : `${basePath}/${newName}`) : newName;
      await api.renameItem(node.path, newPath);
    } else if (type === 'delete' && node) {
      if (node.type === NodeType.Folder) {
        await api.deleteFolder(node.path);
      } else {
        await api.deleteFile(node.path);
      }
    }

    setModalState({type: null});
    fetchFiles();
  };

  const handleNativeOpen = async (node: TreeNode) => {
    setContextMenuNode(null);
    await api.openNative(node.path);
  };

  // Drag and Drop
  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData("text/plain", path);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourcePath = e.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === targetFolder) return;

    // Prevent dropping a folder into itself
    if (targetFolder.startsWith(sourcePath + '/')) return;

    const sourceName = sourcePath.split('/').pop();
    const destPath = targetFolder ? `${targetFolder}/${sourceName}` : sourceName;

    if (sourcePath !== destPath) {
      await api.moveItem(sourcePath, destPath!);
      fetchFiles();
    }
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const sortedChildren = Object.values(node.children).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === NodeType.Folder ? -1 : 1;
    });

    const isSelectedFolder = selectedFolder === node.path;
    const isActive = activeFile === node.path;

    return (
      <div key={node.path} className="flex flex-col">
        <Dropdown isOpen={contextMenuNode === node.path} onOpenChange={(isOpen) => !isOpen && setContextMenuNode(null)}>
          <Dropdown.Trigger>
            <div
              className={`flex items-center justify-between group/item py-[6px] my-[1px] mr-2 ml-2 rounded-md text-[13px] font-medium transition-all duration-150 cursor-pointer ${isActive ? 'bg-emerald-500 text-white shadow-sm' : isSelectedFolder ? 'bg-zinc-800/40 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'}`}
              style={{paddingLeft: `${level * 16 + 6}px`, paddingRight: '6px'}}
              onClick={(e) => {
                e.stopPropagation();
                if (node.type === NodeType.Folder) {
                  toggleFolder(node.path);
                  setSelectedFolder(node.path);
                } else {
                  setActiveFile(node.path);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenuNode(node.path);
              }}
              draggable
              onDragStart={(e) => handleDragStart(e, node.path)}
              onDragOver={node.type === NodeType.Folder ? handleDragOver : undefined}
              onDrop={node.type === NodeType.Folder ? (e) => handleDrop(e, node.path) : undefined}
            >
              <div className="flex items-center gap-2 truncate">
                {node.type === NodeType.Folder ? (
                  isExpanded ? <FolderOpen
                      className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : isSelectedFolder ? 'text-emerald-400' : 'text-zinc-500'}`}/> :
                    <Folder
                      className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-zinc-600 group-hover/item:text-zinc-400'}`}/>
                ) : node.type === NodeType.File ? (
                  <FileText
                    className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-zinc-600 group-hover/item:text-zinc-400'}`}/>
                ) : (
                  <LineSquiggle
                    className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-zinc-600 group-hover/item:text-zinc-400'}`}/>
                )}
                <span className="truncate select-none">{node.name}</span>
              </div>
            </div>
          </Dropdown.Trigger>

          <Dropdown.Popover className="dark bg-zinc-900 border border-zinc-800 rounded-md shadow-xl min-w-[120px]">
            <Dropdown.Menu aria-label="Item Actions" className="p-1">
              <Dropdown.Item key="rename" onPress={() => handleRename(node)}
                             className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 cursor-pointer">
                Rename
              </Dropdown.Item>
              <Dropdown.Item key="delete" onPress={() => handleDelete(node)}
                             className="text-xs text-red-400 hover:bg-red-950/30 rounded px-2 py-1.5 cursor-pointer">
                Delete
              </Dropdown.Item>
              <Dropdown.Item key="openNative" onPress={() => handleNativeOpen(node)}
                             className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 cursor-pointer">
                Open in Explorer
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        {node.type === NodeType.Folder && isExpanded && (
          <div className="flex flex-col">
            {sortedChildren.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-full"
      onClick={() => setSelectedFolder('')}
      onDragOver={handleDragOver}
      onDrop={(e) => handleDrop(e, '')}
    >
      <div className="flex items-center justify-between mb-3 select-none px-2 pt-2 pb-2 border-b border-zinc-800/30">
        <p className="border-none min-w-0 h-7 flex items-center text-xs font-bold text-zinc-400 uppercase">
          {<NotebookIcon className="w-4 h-4 mr-1.5"/>}
          {notebookName}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCreateFile();
            }}
            className="text-zinc-500 hover:text-emerald-400 transition-colors p-1 cursor-pointer"
            title="New File"
          >
            <Plus className="w-4 h-4"/>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCreateSketch();
            }}
            className="text-zinc-500 hover:text-emerald-400 transition-colors p-1 cursor-pointer"
            title="New Sketch"
          >
            <LineSquiggle className="w-4 h-4"/>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCreateFolder();
            }}
            className="text-zinc-500 hover:text-emerald-400 transition-colors p-1 cursor-pointer"
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4"/>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-4">
        {Object.values(tree.children).sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === NodeType.Folder ? -1 : 1;
        }).map(child => renderNode(child, 0))}
        {Object.keys(tree.children).length === 0 && (
          <div className="text-xs text-zinc-600 px-2 italic mt-2">No files found.</div>
        )}
      </div>

      <Modal isOpen={modalState.type !== null} onOpenChange={(open) => !open && setModalState({type: null})}>
        <Modal.Backdrop className="bg-black/60 backdrop-blur-sm">
          <Modal.Container>
            <Modal.Dialog
              className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden w-full max-w-sm">
              <Modal.Header className="border-b border-zinc-800 bg-zinc-900/50 p-4 pb-3">
                <Modal.Heading className="text-sm font-semibold text-zinc-100">
                  {modalState.type === 'createFile' && 'Create File'}
                  {modalState.type === 'createSketch' && 'Create Sketch'}
                  {modalState.type === 'createFolder' && 'Create Folder'}
                  {modalState.type === 'rename' && 'Rename'}
                  {modalState.type === 'delete' && 'Delete Item'}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="p-4 py-5">
                {modalState.type === 'delete' ? (
                  <p className="text-sm text-zinc-300">Are you sure you want to delete <span
                    className="font-semibold text-red-400">{modalState.node?.name}</span>?</p>
                ) : (
                  <Input
                    autoFocus
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    placeholder={modalState.type === 'createFolder' ? "Folder name" : "Filename"}
                    className="bg-zinc-800 text-zinc-100 text-sm border-zinc-700 hover:border-emerald-500/50 focus-within:!border-emerald-500 rounded-md px-3 py-1.5 w-full"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleModalSubmit();
                    }}
                  />
                )}
              </Modal.Body>
              <Modal.Footer className="border-t border-zinc-800 p-3 flex justify-end gap-2 bg-zinc-900/30">
                <Button onPress={() => setModalState({type: null})} variant="ghost"
                        className="text-zinc-400 hover:text-zinc-100 h-8 text-xs font-medium px-4">Cancel</Button>
                <Button
                  onPress={handleModalSubmit}
                  className={`h-8 text-xs font-medium px-4 text-white shadow-md ${modalState.type === 'delete' ? 'bg-red-500/90 hover:bg-red-500' : 'bg-emerald-600/90 hover:bg-emerald-600'}`}
                >
                  {modalState.type === 'delete' ? 'Delete' : 'Confirm'}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}

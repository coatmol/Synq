import {useEffect, useState} from 'react';
import {api} from '../api';
import {useDocumentStore} from '../hooks/useDocumentHub';
import {UserAvatar} from './UserAvatar';
import {GitGraph, RefreshCw, Copy, RotateCcw, Hash} from 'lucide-react';

export function VersionHistory() {
  const [commits, setCommits] = useState<any[]>([]);
  const {setActiveFile, activeFile} = useDocumentStore();

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, commit: any } | null>(null);

  useEffect(() => {
    fetchCommits();
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, commit: any) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, commit });
  };

  const handleCopyContents = async (commit: any) => {
    const content = await api.getCommitContent(commit.fileName, commit.commitId);
    if (content !== null) {
      navigator.clipboard.writeText(content);
    }
  };

  const handleRestore = async (commit: any) => {
    const content = await api.getCommitContent(commit.fileName, commit.commitId);
    if (content !== null) {
      await api.restoreFile(commit.fileName, content, commit.commitId);
      setActiveFile(commit.fileName);
      await fetchCommits(); // Refresh to show new commit
    }
  };
  
  const handleCopyId = (commit: any) => {
    navigator.clipboard.writeText(commit.commitId);
  };

  const fetchCommits = async () => {
    const data = await api.getCommits();
    setCommits(data);
  };

  const openDiff = (fileName: string, commitId: string, parentId?: string) => {
    const diffUri = `diff:${fileName}:${commitId}${parentId ? `:${parentId}` : ''}`;
    setActiveFile(diffUri);
  };

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#18181b]">
      <div className="p-3 text-xs font-semibold text-zinc-500 tracking-wider uppercase mb-1 flex items-center justify-between">
        <div className={"border-none min-w-0 h-7 flex items-center text-xs font-bold text-zinc-400 uppercase"}>
          <span className="flex items-center text-zinc-400">
            <GitGraph className="w-5 h-5 mr-1.5" />
            Version History
          </span>
        </div>
        <button 
          onClick={fetchCommits} 
          className="text-zinc-500 hover:text-emerald-400 transition-colors p-1 cursor-pointer"
          title="Refresh History"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-1 px-2 pb-4">
        {commits.map((commit) => {
          const isSelected = activeFile?.startsWith(`diff:${commit.fileName}:${commit.commitId}`);
          const date = new Date(commit.timestamp);
          const month = date.toLocaleString('en-US', { month: 'short' });
          const day = date.getDate().toString().padStart(2, '0');
          const year = date.getFullYear();
          let hours = date.getHours();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours ? hours : 12;
          const minutes = date.getMinutes().toString().padStart(2, '0');
          const formattedDate = `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;

          return (
            <div
              key={`${commit.fileName}-${commit.commitId}`}
              onClick={() => openDiff(commit.fileName, commit.commitId, commit.parentId)}
              onContextMenu={(e) => handleContextMenu(e, commit)}
              className={`flex flex-col p-2 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-zinc-800 border-l-2 border-emerald-500'
                  : 'hover:bg-zinc-800/50 border-l-2 border-transparent'
              }`}
            >
              <div className="flex gap-2.5 items-start">
                <div className={`shrink-0 mt-0.5 rounded-full ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-[#18181b]' : ''}`}>
                  <UserAvatar name={commit.authorName || 'ME'} size="md" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-[12px] font-medium truncate ${isSelected ? 'text-zinc-100' : 'text-zinc-300'}`} title={commit.message || (commit.isDeleted ? `Deleted ${commit.fileName}` : `Edited ${commit.fileName}`)}>
                    {commit.message || (commit.isDeleted ? `Deleted ${commit.fileName.split('/').pop()}` : `Edited ${commit.fileName.split('/').pop()}`)}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] ${isSelected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      {commit.authorName}
                    </span>
                    <span className="text-[10px] text-zinc-600">•</span>
                    <span className={`text-[10px] truncate ${isSelected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      {formattedDate}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {commits.length === 0 && (
          <div className="text-zinc-500 text-xs px-2 text-center mt-4">
            No history available.
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl py-1 min-w-[160px] text-[13px] text-zinc-300 backdrop-blur-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { handleCopyContents(contextMenu.commit); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 flex items-center gap-2 transition-colors group"
          >
            <Copy size={14} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            <span>Copy File Contents</span>
          </button>

          <button
            onClick={() => { handleCopyId(contextMenu.commit); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 flex items-center gap-2 transition-colors group"
          >
            <Hash size={14} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            <span>Copy Commit ID</span>
          </button>
          
          <div className="h-px bg-zinc-800/80 my-1 mx-2" />
          
          <button
            onClick={() => { handleRestore(contextMenu.commit); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 flex items-center gap-2 transition-colors group"
          >
            <RotateCcw size={14} className="text-emerald-500 group-hover:text-emerald-400 transition-colors" />
            <span className="text-emerald-400 group-hover:text-emerald-300 transition-colors">Restore This Version</span>
          </button>
        </div>
      )}
    </div>
  );
}

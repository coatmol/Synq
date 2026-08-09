import {useEffect, useState} from 'react';
import {api} from '../api';
import {useDocumentStore} from '../hooks/useDocumentHub';

export function VersionHistory() {
  const [commits, setCommits] = useState<any[]>([]);
  const {setActiveFile, activeFile} = useDocumentStore();

  useEffect(() => {
    fetchCommits();
  }, []);

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
      <div className="p-3 text-xs font-semibold text-zinc-500 tracking-wider uppercase mb-1">
        Version History
      </div>
      <div className="flex flex-col gap-1 px-2 pb-4">
        {commits.map((commit) => {
          const isSelected = activeFile?.startsWith(`diff:${commit.fileName}:${commit.commitId}`);
          const date = new Date(commit.timestamp);
          const initials = commit.authorName ? commit.authorName.slice(0, 2).toUpperCase() : 'ME';

          return (
            <div
              key={`${commit.fileName}-${commit.commitId}`}
              onClick={() => openDiff(commit.fileName, commit.commitId, commit.parentId)}
              className={`flex flex-col p-2 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-zinc-800 border-l-2 border-emerald-500'
                  : 'hover:bg-zinc-800/50 border-l-2 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${
                    isSelected ? 'bg-emerald-600' : 'bg-zinc-600'
                  }`}>
                  {initials}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className={`text-[11px] truncate ${isSelected ? 'text-zinc-200' : 'text-zinc-400'}`}>
                    {date.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="text-[12px] text-zinc-300 truncate pl-8" title={commit.fileName}>
                {commit.fileName.split('/').pop()}
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
    </div>
  );
}

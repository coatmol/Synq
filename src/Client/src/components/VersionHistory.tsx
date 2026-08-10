import {useEffect, useState} from 'react';
import {api} from '../api';
import {useDocumentStore} from '../hooks/useDocumentHub';
import {UserAvatar} from './UserAvatar';
import {GitGraph, RefreshCw, Copy, RotateCcw, Hash} from 'lucide-react';
import {Autocomplete, ListBox, SearchField, EmptyState, Tooltip, useFilter, Dropdown, Header, Separator} from "@heroui/react";

export function VersionHistory() {
  const [commits, setCommits] = useState<any[]>([]);
  const {setActiveFile, activeFile, versionHistoryFilter, setVersionHistoryFilter} = useDocumentStore();
  const searchQuery = versionHistoryFilter;
  const setSearchQuery = setVersionHistoryFilter;

  const [contextMenuCommitId, setContextMenuCommitId] = useState<string | null>(null);

  useEffect(() => {
    fetchCommits();
    const handleGlobalClick = () => setContextMenuCommitId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

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

  const {contains} = useFilter({sensitivity: "base"});
  const uniqueFiles = Array.from(new Set(commits.map(c => c.fileName as string)));

  const filteredCommits = commits.filter(commit => 
    commit.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#18181b]">
      <div
        className="p-3 text-xs font-semibold text-zinc-500 tracking-wider uppercase mb-1 flex items-center justify-between">
        <div className={"border-none min-w-0 h-7 flex items-center text-xs font-bold text-zinc-400 uppercase"}>
          <span className="flex items-center text-zinc-400">
            <GitGraph className="w-5 h-5 mr-1.5"/>
            Version History
          </span>
        </div>
        <Tooltip delay={500}>
          <Tooltip.Trigger>
            <button
              onClick={fetchCommits}
              className="text-zinc-500 hover:text-emerald-400 transition-colors p-1 cursor-pointer"
            >
              <RefreshCw size={14}/>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="top" showArrow={true}
                           className="dark bg-zinc-800 text-zinc-100 text-[11px] px-2 py-1 rounded shadow-xl">
            Refresh History
          </Tooltip.Content>
        </Tooltip>
      </div>
      <div className="flex flex-col gap-1 px-2 pb-4">
        <div className="mb-2">
          <Autocomplete
            className="w-full"
            placeholder="Search by file name..."
            selectionMode="single"
            value={searchQuery}
            onChange={(key) => setSearchQuery(key ? key.toString() : "")}
            variant="secondary"
          >
            <Autocomplete.Trigger className="h-8 min-h-8 bg-[#27272a] hover:bg-[#27272a]/80 border-none group-data-[focus=true]:bg-[#27272a]">
              <Autocomplete.Value className="text-[12px] text-zinc-100 placeholder:text-zinc-500" />
              <Autocomplete.ClearButton />
              <Autocomplete.Indicator />
            </Autocomplete.Trigger>
            <Autocomplete.Popover placement="bottom" className="dark bg-[#18181b] border border-zinc-800 rounded-md shadow-xl w-[300px]">
              <Autocomplete.Filter filter={contains}>
                <SearchField autoFocus name="search" variant="secondary" className="mb-2 mt-1 px-1">
                  <SearchField.Group className="bg-zinc-800/50 border border-zinc-700/50 h-8">
                    <SearchField.SearchIcon className="w-3.5 h-3.5 text-zinc-400" />
                    <SearchField.Input placeholder="Search files..." className="text-xs text-zinc-200 placeholder:text-zinc-500" />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
                <ListBox items={uniqueFiles.map(f => ({id: f, name: f}))} renderEmptyState={() => <EmptyState>No files found</EmptyState>}>
                  {(item) => (
                    <ListBox.Item key={item.id} id={item.id} textValue={item.name} className="text-zinc-300 text-xs data-[hover=true]:bg-zinc-800/50">
                      {item.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  )}
                </ListBox>
              </Autocomplete.Filter>
            </Autocomplete.Popover>
          </Autocomplete>
        </div>
        {filteredCommits.map((commit) => {
          const isSelected = activeFile?.startsWith(`diff:${commit.fileName}:${commit.commitId}`);
          const date = new Date(commit.timestamp);
          const month = date.toLocaleString('en-US', {month: 'short'});
          const day = date.getDate().toString().padStart(2, '0');
          const year = date.getFullYear();
          let hours = date.getHours();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours ? hours : 12;
          const minutes = date.getMinutes().toString().padStart(2, '0');
          const formattedDate = `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;

          return (
            <Dropdown isOpen={contextMenuCommitId === commit.commitId} onOpenChange={(isOpen) => !isOpen && setContextMenuCommitId(null)} key={`${commit.commitId}-${commit.fileName}`}>
              <Dropdown.Trigger>
                <div
                  onClick={() => openDiff(commit.fileName, commit.commitId, commit.parentId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenuCommitId(commit.commitId);
                  }}
                  className={`flex flex-col p-2 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-zinc-800 border-l-2 border-emerald-500'
                      : 'hover:bg-zinc-800/50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex gap-2.5 items-start">
                    <div
                      className={`shrink-0 mt-0.5 rounded-full ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-[#18181b]' : ''}`}>
                      <UserAvatar name={commit.authorName || 'ME'} size="md"/>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <Tooltip delay={500}>
                        <Tooltip.Trigger>
                          <span
                            className={`text-[12px] font-medium truncate ${isSelected ? 'text-zinc-100' : 'text-zinc-300'}`}>
                            {commit.message || (commit.isDeleted ? `Deleted ${commit.fileName.split('/').pop()}` : `Edited ${commit.fileName.split('/').pop()}`)}
                          </span>
                        </Tooltip.Trigger>
                        <Tooltip.Content placement="top" showArrow={true}
                                         className="dark bg-zinc-800 text-zinc-100 text-[11px] px-2 py-1 rounded shadow-xl">
                          {commit.message || (commit.isDeleted ? `Deleted ${commit.fileName}` : `Edited ${commit.fileName}`)}
                        </Tooltip.Content>
                      </Tooltip>
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
              </Dropdown.Trigger>
              <Dropdown.Popover className="bg-[#18181b] border border-zinc-800/80 shadow-2xl rounded-xl min-w-[240px] p-1.5 overflow-hidden">
                <Dropdown.Menu aria-label="Commit Actions" className="outline-none flex flex-col gap-0.5">
                  <Dropdown.Section>
                    <Header className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1.5 select-none">Copy</Header>
                    <Dropdown.Item id="copyContents" textValue="Copy File Contents" onPress={() => handleCopyContents(commit)}
                                   className="flex items-start gap-3 px-2 py-2 rounded-lg outline-none cursor-pointer text-zinc-300 data-[focused=true]:bg-zinc-800/80 data-[focused=true]:text-zinc-100 transition-colors">
                      <div className="flex h-5 items-center justify-center shrink-0">
                        <Copy size={16} className="text-zinc-400" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium truncate">Copy File Contents</span>
                        <span className="text-[11px] text-zinc-500 truncate">Copy full content at this version</span>
                      </div>
                    </Dropdown.Item>
                    <Dropdown.Item id="copyId" textValue="Copy Commit ID" onPress={() => handleCopyId(commit)}
                                   className="flex items-start gap-3 px-2 py-2 rounded-lg outline-none cursor-pointer text-zinc-300 data-[focused=true]:bg-zinc-800/80 data-[focused=true]:text-zinc-100 transition-colors">
                      <div className="flex h-5 items-center justify-center shrink-0">
                        <Hash size={16} className="text-zinc-400" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium truncate">Copy Commit ID</span>
                        <span className="text-[11px] text-zinc-500 truncate">Copy the unique SHA hash</span>
                      </div>
                    </Dropdown.Item>
                  </Dropdown.Section>
                  
                  <Separator className="bg-zinc-800/60 my-1 mx-2 h-px" />
                  
                  <Dropdown.Section>
                    <Header className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1.5 select-none">Restore</Header>
                    <Dropdown.Item id="restore" textValue="Restore This Version" onPress={() => handleRestore(commit)}
                                   className="flex items-start gap-3 px-2 py-2 rounded-lg outline-none cursor-pointer text-emerald-400 data-[focused=true]:bg-emerald-500/10 data-[focused=true]:text-emerald-400 transition-colors">
                      <div className="flex h-5 items-center justify-center shrink-0">
                        <RotateCcw size={16} className="text-emerald-400" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium truncate">Restore This Version</span>
                        <span className="text-[11px] text-emerald-400/70 truncate">Revert file to this exact state</span>
                      </div>
                    </Dropdown.Item>
                  </Dropdown.Section>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          );
        })}
        {filteredCommits.length === 0 && (
          <div className="text-zinc-500 text-xs px-2 text-center mt-4">
            {commits.length === 0 ? "No history available." : "No commits match your search."}
          </div>
        )}
      </div>


    </div>
  );
}

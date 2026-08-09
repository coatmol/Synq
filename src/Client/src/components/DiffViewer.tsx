import {useEffect, useState} from 'react';
import {api} from '../api';
import {diff_match_patch} from 'diff-match-patch';

interface DiffViewerProps {
  fileUri: string; // e.g., diff:fileName:commitId:parentId
}

export function DiffViewer({fileUri}: DiffViewerProps) {
  const [oldContent, setOldContent] = useState<string | null>(null);
  const [newContent, setNewContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    const parts = fileUri.split(':');
    const fName = parts[1];
    const commitId = parts[2];
    const parentId = parts[3];

    setFileName(fName);

    const loadData = async () => {
      setLoading(true);
      try {
        const newText = await api.getCommitContent(fName, commitId) || '';

        let oldText = '';
        if (parentId && parentId !== 'null' && parentId !== 'undefined') {
          oldText = await api.getCommitContent(fName, parentId) || '';
        }

        setNewContent(newText);
        setOldContent(oldText);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fileUri]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-zinc-500 bg-[#1e1e1e]">Loading diff...</div>;
  }

  const dmp = new diff_match_patch();
  const a = dmp.diff_linesToChars_(oldContent || '', newContent || '');
  const diffs = dmp.diff_main(a.chars1, a.chars2, false);
  dmp.diff_charsToLines_(diffs, a.lineArray);

  return (
    <div className="flex-1 overflow-auto bg-[#1e1e1e] text-[14px] font-mono leading-relaxed flex justify-center p-8">
      <div className="w-full">
        <h2
          className="text-xl font-sans font-semibold text-zinc-200 mb-6 pb-4 border-b border-zinc-800/80 flex items-center gap-3">
          <span className="text-zinc-500 font-normal">#</span>
          {fileName}
        </h2>
        
        <div className="flex flex-col gap-1">
          {diffs.map((part, index) => {
            const op = part[0];
            const text = part[1];

            // Text can contain multiple lines, we split them to render each line cleanly
            const lines = text.replace(/\n$/, '').split('\n');

            return lines.map((line, lineIndex) => {
              if (op === 0) {
                return (
                  <div key={`${index}-${lineIndex}`}
                       className="px-4 py-1.5 text-zinc-400 flex gap-4 transition-colors hover:bg-zinc-800/40 rounded-md">
                    <span className="w-4 select-none opacity-40 text-right text-xs pt-0.5"></span>
                    <span className="whitespace-pre-wrap">{line}</span>
                  </div>
                );
              }
              if (op === -1) {
                return (
                  <div key={`${index}-${lineIndex}`}
                       className="px-4 py-1.5 bg-red-950/30 text-red-400 flex gap-4 rounded-md my-0.5">
                    <span className="w-4 select-none font-bold text-red-500/70 text-right">-</span>
                    <span className="whitespace-pre-wrap">{line}</span>
                  </div>
                );
              }
              if (op === 1) {
                return (
                  <div key={`${index}-${lineIndex}`}
                       className="px-4 py-1.5 bg-emerald-950/30 text-emerald-400 flex gap-4 rounded-md my-0.5">
                    <span className="w-4 select-none font-bold text-emerald-500/70 text-right">+</span>
                    <span className="whitespace-pre-wrap">{line}</span>
                  </div>
                );
              }
            });
          })}
        </div>
      </div>
    </div>
  );
}

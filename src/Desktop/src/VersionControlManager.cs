using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Engine;

namespace Desktop;

public class VersionControlManager
{
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly WorkspaceState _state;

    public VersionControlManager(WorkspaceState state)
    {
        _state = state;
    }

    private async Task AtomicWriteJsonAsync<T>(string filePath, T data)
    {
        var tempFile = filePath + ".tmp";
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            Directory.CreateDirectory(dir);

        await File.WriteAllTextAsync(tempFile,
            JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(tempFile, filePath, true);
    }

    public async Task<string?> CommitFileAsync(string fileName, string authorName, string? message = null)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return null;

        var absPath = PathUtils.GetSafePath(_state.CurrentFolder, fileName);
        if (absPath == null || !File.Exists(absPath)) return null;

        var content = await File.ReadAllTextAsync(absPath);

        string contentHash;
        using (var sha256 = SHA256.Create())
        {
            var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(content));
            contentHash = Convert.ToHexString(hashBytes).ToLowerInvariant();
        }

        var dotSynq = Path.Combine(_state.CurrentFolder, ".synq");
        var indexFile = Path.Combine(dotSynq, "file_index.json");

        await _lock.WaitAsync();
        try
        {
            Dictionary<string, string> index = new();
            if (File.Exists(indexFile))
                index =
                    JsonSerializer.Deserialize<Dictionary<string, string>>(await File.ReadAllTextAsync(indexFile)) ??
                    new Dictionary<string, string>();

            if (!index.TryGetValue(fileName, out var uuid))
            {
                uuid = Guid.NewGuid().ToString("N");
                index[fileName] = uuid;
                await AtomicWriteJsonAsync(indexFile, index);
            }

            var historyDir = Path.Combine(dotSynq, "history", uuid);
            var objectsDir = Path.Combine(historyDir, "objects");
            if (!Directory.Exists(objectsDir)) Directory.CreateDirectory(objectsDir);

            var objectFile = Path.Combine(objectsDir, $"{contentHash}.bin");
            if (!File.Exists(objectFile))
            {
                var compressed = MarkdownCompressor.Compress(content);
                await File.WriteAllBytesAsync(objectFile, compressed);
            }

            var commitsFile = Path.Combine(historyDir, "commits.json");
            CommitHistory history = new();
            if (File.Exists(commitsFile))
                history = JsonSerializer.Deserialize<CommitHistory>(await File.ReadAllTextAsync(commitsFile)) ??
                          new CommitHistory();

            if (history.Head != null && history.Commits.LastOrDefault()?.ContentHash == contentHash)
                return history.Head;

            var commitId = Guid.NewGuid().ToString("N");
            var newCommit = new CommitRecord
            {
                CommitId = commitId,
                ContentHash = contentHash,
                ParentId = history.Head,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                AuthorName = authorName,
                Message = message ?? (history.Commits.Count == 0 ? $"Created {fileName}" : $"Edited {fileName}")
            };

            history.Commits.Add(newCommit);
            history.Head = commitId;

            await AtomicWriteJsonAsync(commitsFile, history);

            return commitId;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<string?> CommitDeletionAsync(string fileName, string authorName)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return null;

        var dotSynq = Path.Combine(_state.CurrentFolder, ".synq");
        var indexFile = Path.Combine(dotSynq, "file_index.json");

        await _lock.WaitAsync();
        try
        {
            if (!File.Exists(indexFile)) return null;

            Dictionary<string, string> index = new();
            index = JsonSerializer.Deserialize<Dictionary<string, string>>(await File.ReadAllTextAsync(indexFile)) ??
                    new Dictionary<string, string>();

            if (!index.TryGetValue(fileName, out var uuid)) return null;

            var historyDir = Path.Combine(dotSynq, "history", uuid);
            var objectsDir = Path.Combine(historyDir, "objects");
            if (!Directory.Exists(objectsDir)) Directory.CreateDirectory(objectsDir);

            var commitId = Guid.NewGuid().ToString("N");
            var contentHash = "";

            var commitsFile = Path.Combine(historyDir, "commits.json");
            CommitHistory history = new();
            if (File.Exists(commitsFile))
                history = JsonSerializer.Deserialize<CommitHistory>(await File.ReadAllTextAsync(commitsFile)) ??
                          new CommitHistory();

            var newCommit = new CommitRecord
            {
                CommitId = commitId,
                ContentHash = contentHash,
                ParentId = history.Head,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                AuthorName = authorName,
                Message = $"Deleted {fileName}",
                IsDeleted = true
            };

            history.Commits.Add(newCommit);
            history.Head = commitId;

            await AtomicWriteJsonAsync(commitsFile, history);

            return commitId;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task MergeFileIndexAsync(string remoteFileIndexContent)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;

        var indexFile = Path.Combine(_state.CurrentFolder, ".synq", "file_index.json");

        await _lock.WaitAsync();
        try
        {
            Dictionary<string, string> localIndex = new();
            if (File.Exists(indexFile))
                localIndex =
                    JsonSerializer.Deserialize<Dictionary<string, string>>(await File.ReadAllTextAsync(indexFile)) ??
                    new Dictionary<string, string>();

            var remoteIndex = JsonSerializer.Deserialize<Dictionary<string, string>>(remoteFileIndexContent) ??
                              new Dictionary<string, string>();
            var changed = false;

            foreach (var kvp in remoteIndex)
                if (!localIndex.ContainsKey(kvp.Key))
                {
                    localIndex[kvp.Key] = kvp.Value;
                    changed = true;
                }

            if (changed) await AtomicWriteJsonAsync(indexFile, localIndex);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task MergeCommitsJsonAsync(string uuid, string remoteCommitsJsonContent)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;
        if (!Regex.IsMatch(uuid, "^[0-9a-f]{32}$")) return;

        var commitsFile = Path.Combine(_state.CurrentFolder, ".synq", "history", uuid, "commits.json");

        await _lock.WaitAsync();
        try
        {
            CommitHistory localHistory = new();
            if (File.Exists(commitsFile))
                localHistory = JsonSerializer.Deserialize<CommitHistory>(await File.ReadAllTextAsync(commitsFile)) ??
                               new CommitHistory();

            var remoteHistory = JsonSerializer.Deserialize<CommitHistory>(remoteCommitsJsonContent) ??
                                new CommitHistory();
            var changed = false;

            var localCommitIds = new HashSet<string>(localHistory.Commits.Select(c => c.CommitId));

            foreach (var remoteCommit in remoteHistory.Commits)
                if (!localCommitIds.Contains(remoteCommit.CommitId))
                {
                    localHistory.Commits.Add(remoteCommit);
                    changed = true;
                }

            if (changed)
            {
                localHistory.Commits = localHistory.Commits.OrderBy(c => c.Timestamp).ToList();
                var latest = localHistory.Commits.LastOrDefault();
                if (latest != null) localHistory.Head = latest.CommitId;

                await AtomicWriteJsonAsync(commitsFile, localHistory);
            }
        }
        finally
        {
            _lock.Release();
        }
    }
}
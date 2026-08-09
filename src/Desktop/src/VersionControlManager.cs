using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Engine;

namespace Desktop;

public class VersionControlManager
{
    private readonly WorkspaceState _state;

    public VersionControlManager(WorkspaceState state)
    {
        _state = state;
    }

    public async Task<string?> CommitFileAsync(string fileName, string authorName)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return null;

        var absPath = PathUtils.GetSafePath(_state.CurrentFolder, fileName);
        if (absPath == null || !File.Exists(absPath)) return null;

        var content = await File.ReadAllTextAsync(absPath);

        string commitId;
        using (var sha256 = SHA256.Create())
        {
            var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(content));
            commitId = Convert.ToHexString(hashBytes).ToLowerInvariant();
        }

        var dotSynq = Path.Combine(_state.CurrentFolder, ".synq");
        var indexFile = Path.Combine(dotSynq, "file_index.json");
        if (!Directory.Exists(dotSynq)) Directory.CreateDirectory(dotSynq);

        Dictionary<string, string> index = new();
        if (File.Exists(indexFile))
            index = JsonSerializer.Deserialize<Dictionary<string, string>>(await File.ReadAllTextAsync(indexFile)) ??
                    new Dictionary<string, string>();

        if (!index.TryGetValue(fileName, out var uuid))
        {
            uuid = Guid.NewGuid().ToString("N");
            index[fileName] = uuid;
            await File.WriteAllTextAsync(indexFile,
                JsonSerializer.Serialize(index, new JsonSerializerOptions { WriteIndented = true }));
        }

        var historyDir = Path.Combine(dotSynq, "history", uuid);
        var objectsDir = Path.Combine(historyDir, "objects");
        if (!Directory.Exists(objectsDir)) Directory.CreateDirectory(objectsDir);

        var objectFile = Path.Combine(objectsDir, $"{commitId}.bin");
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

        if (history.Commits.Any(c => c.CommitId == commitId)) return commitId; // No changes to commit

        var newCommit = new CommitRecord
        {
            CommitId = commitId,
            ParentId = history.Head,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            AuthorName = authorName
        };

        history.Commits.Add(newCommit);
        history.Head = commitId;

        await File.WriteAllTextAsync(commitsFile,
            JsonSerializer.Serialize(history, new JsonSerializerOptions { WriteIndented = true }));

        return commitId;
    }

    public async Task MergeFileIndexAsync(string remoteFileIndexContent)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;

        var indexFile = Path.Combine(_state.CurrentFolder, ".synq", "file_index.json");
        Dictionary<string, string> localIndex = new();
        if (File.Exists(indexFile))
            localIndex =
                JsonSerializer.Deserialize<Dictionary<string, string>>(await File.ReadAllTextAsync(indexFile)) ??
                new Dictionary<string, string>();

        var remoteIndex = JsonSerializer.Deserialize<Dictionary<string, string>>(remoteFileIndexContent) ??
                          new Dictionary<string, string>();
        var changed = false;

        foreach (var kvp in remoteIndex)
            if (!localIndex.ContainsKey(kvp.Key) || localIndex[kvp.Key] != kvp.Value)
            {
                localIndex[kvp.Key] = kvp.Value;
                changed = true;
            }

        if (changed)
        {
            var dir = Path.GetDirectoryName(indexFile);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir!);
            await File.WriteAllTextAsync(indexFile,
                JsonSerializer.Serialize(localIndex, new JsonSerializerOptions { WriteIndented = true }));
        }
    }

    public async Task MergeCommitsJsonAsync(string uuid, string remoteCommitsJsonContent)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;

        var commitsFile = Path.Combine(_state.CurrentFolder, ".synq", "history", uuid, "commits.json");
        CommitHistory localHistory = new();
        if (File.Exists(commitsFile))
            localHistory = JsonSerializer.Deserialize<CommitHistory>(await File.ReadAllTextAsync(commitsFile)) ??
                           new CommitHistory();

        var remoteHistory = JsonSerializer.Deserialize<CommitHistory>(remoteCommitsJsonContent) ?? new CommitHistory();
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

            var dir = Path.GetDirectoryName(commitsFile);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir!);
            await File.WriteAllTextAsync(commitsFile,
                JsonSerializer.Serialize(localHistory, new JsonSerializerOptions { WriteIndented = true }));
        }
    }
}
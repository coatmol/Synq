using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Desktop;

public class ManifestFileEntry
{
    [JsonPropertyName("relativePath")]
    public string RelativePath { get; set; } = string.Empty;

    [JsonPropertyName("contentHash")]
    public string ContentHash { get; set; } = string.Empty;

    [JsonPropertyName("updatedAt")]
    public long UpdatedAt { get; set; }

    [JsonPropertyName("isTombstone")]
    public bool IsTombstone { get; set; }
}

public class SyncManifest
{
    [JsonPropertyName("peerId")]
    public string PeerId { get; set; } = Environment.MachineName;

    [JsonPropertyName("files")]
    public Dictionary<string, ManifestFileEntry> Files { get; set; } = new();
}

public class SyncManager
{
    private readonly WorkspaceState _state;
    private readonly DocumentManager _documentManager;

    public SyncManager(WorkspaceState state, DocumentManager documentManager)
    {
        _state = state;
        _documentManager = documentManager;
    }

    private string GetManifestPath(string folderPath)
    {
        var dotSynq = Path.Combine(folderPath, ".synq");
        if (!Directory.Exists(dotSynq))
        {
            var dirInfo = Directory.CreateDirectory(dotSynq);
            dirInfo.Attributes |= FileAttributes.Hidden;
        }
        return Path.Combine(dotSynq, "manifest.json");
    }

    public SyncManifest LoadManifest(string folderPath)
    {
        var path = GetManifestPath(folderPath);
        if (File.Exists(path))
        {
            try
            {
                var content = File.ReadAllText(path);
                var manifest = JsonSerializer.Deserialize<SyncManifest>(content);
                if (manifest != null) return manifest;
            }
            catch { }
        }
        return new SyncManifest();
    }

    public void SaveManifest(string folderPath, SyncManifest manifest)
    {
        var path = GetManifestPath(folderPath);
        var json = JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(path, json);
    }

    private string ComputeHash(string filePath)
    {
        using var sha256 = SHA256.Create();
        using var stream = File.OpenRead(filePath);
        var hash = sha256.ComputeHash(stream);
        return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
    }

    public SyncManifest InitializeLocalFolder()
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return new SyncManifest();

        var manifest = LoadManifest(_state.CurrentFolder);
        var filesOnDisk = Directory.GetFiles(_state.CurrentFolder, "*.md", SearchOption.TopDirectoryOnly)
            .ToDictionary(f => Path.GetFileName(f)!, f => f); // RelativePath -> AbsolutePath

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // 1. Check existing files on disk
        foreach (var (relPath, absPath) in filesOnDisk)
        {
            var hash = ComputeHash(absPath);

            var entryPair = manifest.Files.FirstOrDefault(x => x.Value.RelativePath == relPath);
            if (entryPair.Key != null) // Exists in manifest
            {
                var entry = entryPair.Value;
                if (entry.ContentHash != hash || entry.IsTombstone)
                {
                    entry.ContentHash = hash;
                    entry.UpdatedAt = now;
                    entry.IsTombstone = false;
                }
            }
            else
            {
                // New file
                var id = Guid.NewGuid().ToString();
                manifest.Files[id] = new ManifestFileEntry
                {
                    RelativePath = relPath,
                    ContentHash = hash,
                    UpdatedAt = now,
                    IsTombstone = false
                };
            }
        }

        // 2. Check missing files from manifest
        foreach (var (id, entry) in manifest.Files)
        {
            if (!filesOnDisk.ContainsKey(entry.RelativePath))
            {
                if (!entry.IsTombstone)
                {
                    entry.IsTombstone = true;
                    entry.UpdatedAt = now;
                }
            }
        }

        SaveManifest(_state.CurrentFolder, manifest);
        return manifest;
    }

    public async Task ProcessRemoteManifest(SyncManifest remoteManifest, string peerBaseUrl)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;

        var localManifest = InitializeLocalFolder();
        var allPaths = localManifest.Files.Values.Select(v => v.RelativePath)
            .Union(remoteManifest.Files.Values.Select(v => v.RelativePath))
            .Distinct();

        using var http = new HttpClient();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        foreach (var path in allPaths)
        {
            var localEntryPair = localManifest.Files.FirstOrDefault(x => x.Value.RelativePath == path);
            var remoteEntryPair = remoteManifest.Files.FirstOrDefault(x => x.Value.RelativePath == path);

            var hasLocal = localEntryPair.Key != null;
            var hasRemote = remoteEntryPair.Key != null;
            var localEntry = localEntryPair.Value;
            var remoteEntry = remoteEntryPair.Value;

            if (hasLocal && hasRemote)
            {
                if (localEntry!.ContentHash == remoteEntry!.ContentHash && localEntry.IsTombstone == remoteEntry.IsTombstone)
                {
                    continue;
                }

                if (localEntry.IsTombstone && !remoteEntry.IsTombstone)
                {
                    if (localEntry.UpdatedAt > remoteEntry.UpdatedAt)
                    {
                        await http.DeleteAsync($"{peerBaseUrl}/api/files/{remoteEntry.RelativePath}");
                    }
                    else
                    {
                        await FetchAndSaveFile(http, peerBaseUrl, remoteEntry.RelativePath);
                        localEntry.IsTombstone = false;
                        localEntry.ContentHash = remoteEntry.ContentHash;
                        localEntry.UpdatedAt = now;
                    }
                }
                else if (!localEntry.IsTombstone && remoteEntry.IsTombstone)
                {
                    if (remoteEntry.UpdatedAt > localEntry.UpdatedAt)
                    {
                        var filePath = Path.Combine(_state.CurrentFolder, localEntry.RelativePath);
                        if (File.Exists(filePath)) File.Delete(filePath);
                        localEntry.IsTombstone = true;
                        localEntry.UpdatedAt = now;
                    }
                    else
                    {
                        await PushFileToPeer(http, peerBaseUrl, localEntry.RelativePath);
                    }
                }
                else if (!localEntry.IsTombstone && !remoteEntry.IsTombstone)
                {
                    // Strict last-write-wins replacement (no conflict copies)
                    if (remoteEntry.UpdatedAt > localEntry.UpdatedAt)
                    {
                        await FetchAndSaveFile(http, peerBaseUrl, remoteEntry.RelativePath);
                        localEntry.ContentHash = remoteEntry.ContentHash;
                        localEntry.UpdatedAt = now;
                    }
                    else
                    {
                        await PushFileToPeer(http, peerBaseUrl, localEntry.RelativePath);
                    }
                }
            }
            else if (hasLocal && !hasRemote)
            {
                if (!localEntry!.IsTombstone)
                {
                    await PushFileToPeer(http, peerBaseUrl, localEntry.RelativePath);
                }
            }
            else if (!hasLocal && hasRemote)
            {
                if (!remoteEntry!.IsTombstone)
                {
                    await FetchAndSaveFile(http, peerBaseUrl, remoteEntry.RelativePath);
                    localManifest.Files[Guid.NewGuid().ToString()] = new ManifestFileEntry
                    {
                        RelativePath = remoteEntry.RelativePath,
                        ContentHash = remoteEntry.ContentHash,
                        UpdatedAt = now,
                        IsTombstone = false
                    };
                }
            }
        }

        SaveManifest(_state.CurrentFolder, localManifest);
    }

    private async Task FetchAndSaveFile(HttpClient http, string peerBaseUrl, string relativePath)
    {
        var content = await http.GetStringAsync($"{peerBaseUrl}/api/rawfile?filename={Uri.EscapeDataString(relativePath)}");
        var path = Path.Combine(_state.CurrentFolder!, relativePath);
        File.WriteAllText(path, content);
        _documentManager.GetOrCreateDocument(relativePath); // Update memory
    }


    private async Task PushFileToPeer(HttpClient http, string peerBaseUrl, string relativePath)
    {
        var path = Path.Combine(_state.CurrentFolder!, relativePath);
        if (File.Exists(path))
        {
            var content = File.ReadAllText(path);
            var payload = new { filename = relativePath, content = content };
            var json = JsonSerializer.Serialize(payload);
            var reqContent = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            await http.PostAsync($"{peerBaseUrl}/api/rawfile", reqContent);
        }
    }
}

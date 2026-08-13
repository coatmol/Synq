using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;

namespace Desktop;

public class ManifestFileEntry
{
    [JsonPropertyName("relativePath")] public string RelativePath { get; set; } = string.Empty;

    [JsonPropertyName("contentHash")] public string ContentHash { get; set; } = string.Empty;

    [JsonPropertyName("updatedAt")] public long UpdatedAt { get; set; }

    [JsonPropertyName("isTombstone")] public bool IsTombstone { get; set; }

    [JsonPropertyName("isDirectory")] public bool IsDirectory { get; set; }
}

public class KnownWanPeer
{
    [JsonPropertyName("peerId")] public string PeerId { get; set; } = string.Empty;
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("lastSeen")] public long LastSeen { get; set; }
}

public class SyncManifest
{
    [JsonPropertyName("peerId")] public string PeerId { get; set; } = Environment.MachineName;

    [JsonPropertyName("wanNetworkId")] public string WanNetworkId { get; set; } = string.Empty;

    [JsonPropertyName("knownWanPeers")] public Dictionary<string, KnownWanPeer> KnownWanPeers { get; set; } = new();

    [JsonPropertyName("files")] public Dictionary<string, ManifestFileEntry> Files { get; set; } = new();
}

public class SyncManager
{
    private readonly DocumentManager _documentManager;
    private readonly IHubContext<DocumentHub> _hubContext;
    private readonly WorkspaceState _state;
    private readonly VersionControlManager _vc;

    public SyncManager(WorkspaceState state, DocumentManager documentManager, IHubContext<DocumentHub> hubContext,
        VersionControlManager vc)
    {
        _state = state;
        _documentManager = documentManager;
        _hubContext = hubContext;
        _vc = vc;
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
        SyncManifest manifest = null;
        if (File.Exists(path))
            try
            {
                var content = File.ReadAllText(path);
                var loaded = JsonSerializer.Deserialize<SyncManifest>(content);
                if (loaded != null) manifest = loaded;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Sync] Failed to read manifest: {ex.Message}");
                throw new IOException("Manifest file is corrupted or inaccessible", ex);
            }

        if (manifest == null) manifest = new SyncManifest();

        if (string.IsNullOrEmpty(manifest.WanNetworkId))
        {
            manifest.WanNetworkId = Guid.CreateVersion7().ToString();
            SaveManifest(folderPath, manifest);
        }

        return manifest;
    }

    public void SaveManifest(string folderPath, SyncManifest manifest)
    {
        var path = GetManifestPath(folderPath);
        var json = JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true });

        var tempPath = path + ".tmp";
        File.WriteAllText(tempPath, json);
        File.Move(tempPath, path, true);
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

        var allEntriesOnDisk = new Dictionary<string, (string AbsPath, bool IsDirectory)>();
        var rootDi = new DirectoryInfo(_state.CurrentFolder);

        void ScanDirectory(DirectoryInfo d, string relativePath)
        {
            if (d.Name == ".git" || d.Name == "node_modules") return;

            if (!string.IsNullOrEmpty(relativePath))
            {
                var normPath = relativePath.Replace('\\', '/');
                allEntriesOnDisk[normPath] = (d.FullName, true);
            }

            var isSynqRoot = relativePath == ".synq";
            var isSynqHistory = relativePath.StartsWith(".synq/history") || relativePath.StartsWith(".synq\\history");

            foreach (var file in d.GetFiles())
            {
                if (isSynqRoot && file.Name == "manifest.json") continue;
                if (isSynqRoot && file.Name != "file_index.json") continue;

                if (file.Extension == ".md" || file.Extension == ".excalidraw" || isSynqHistory ||
                    (isSynqRoot && file.Name == "file_index.json"))
                {
                    var relPath = string.IsNullOrEmpty(relativePath)
                        ? file.Name
                        : $"{relativePath}/{file.Name}".Replace('\\', '/');
                    allEntriesOnDisk[relPath] = (file.FullName, false);
                }
            }

            foreach (var subDir in d.GetDirectories())
            {
                var relPath = string.IsNullOrEmpty(relativePath) ? subDir.Name : $"{relativePath}/{subDir.Name}";
                ScanDirectory(subDir, relPath);
            }
        }

        if (rootDi.Exists) ScanDirectory(rootDi, "");

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // 1. Check existing items on disk
        foreach (var (relPath, item) in allEntriesOnDisk)
        {
            var hash = item.IsDirectory ? "dir" : ComputeHash(item.AbsPath);

            var entryPair = manifest.Files.FirstOrDefault(x => x.Value.RelativePath == relPath);
            var itemLastWrite = item.IsDirectory
                ? new DateTimeOffset(Directory.GetLastWriteTimeUtc(item.AbsPath)).ToUnixTimeMilliseconds()
                : new DateTimeOffset(File.GetLastWriteTimeUtc(item.AbsPath)).ToUnixTimeMilliseconds();

            if (entryPair.Key != null) // Exists in manifest
            {
                var entry = entryPair.Value;
                if (entry.ContentHash != hash || entry.IsTombstone || entry.IsDirectory != item.IsDirectory)
                {
                    entry.ContentHash = hash;
                    entry.UpdatedAt = itemLastWrite;
                    entry.IsTombstone = false;
                    entry.IsDirectory = item.IsDirectory;
                }
            }
            else
            {
                // New item
                var id = Guid.NewGuid().ToString();
                manifest.Files[id] = new ManifestFileEntry
                {
                    RelativePath = relPath,
                    ContentHash = hash,
                    UpdatedAt = itemLastWrite,
                    IsTombstone = false,
                    IsDirectory = item.IsDirectory
                };
            }
        }

        // 2. Check missing items from manifest
        foreach (var (id, entry) in manifest.Files)
            if (!allEntriesOnDisk.ContainsKey(entry.RelativePath))
                if (!entry.IsTombstone)
                {
                    entry.IsTombstone = true;
                    entry.UpdatedAt = now;
                }

        SaveManifest(_state.CurrentFolder, manifest);
        return manifest;
    }

    public async Task ProcessRemoteManifest(SyncManifest remoteManifest, string peerBaseUrl)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;

        var localManifest = InitializeLocalFolder();

        try
        {
            if (!string.IsNullOrEmpty(remoteManifest.WanNetworkId) &&
                string.Compare(remoteManifest.WanNetworkId, localManifest.WanNetworkId, StringComparison.Ordinal) < 0)
            {
                localManifest.WanNetworkId = remoteManifest.WanNetworkId;
                SaveManifest(_state.CurrentFolder, localManifest);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[LAN] Failed to update WanNetworkId: {ex.Message}");
        }

        var allPaths = localManifest.Files.Values.Select(v => v.RelativePath)
            .Union(remoteManifest.Files.Values.Select(v => v.RelativePath))
            .Distinct();

        using var http = new HttpClient();
        if (Uri.TryCreate(peerBaseUrl, UriKind.Absolute, out var uri))
            if (_state.Settings.PeerPasswords.TryGetValue($"{uri.Host}:{uri.Port}", out var pwd))
                http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pwd);

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
                if (localEntry!.ContentHash == remoteEntry!.ContentHash &&
                    localEntry.IsTombstone == remoteEntry.IsTombstone) continue;

                if (localEntry.IsTombstone && !remoteEntry.IsTombstone)
                {
                    if (localEntry.UpdatedAt > remoteEntry.UpdatedAt)
                    {
                        await http.DeleteAsync($"{peerBaseUrl}/api/files/{remoteEntry.RelativePath}");
                    }
                    else
                    {
                        await FetchAndSaveFile(http, peerBaseUrl, remoteEntry.RelativePath, remoteEntry.IsDirectory);
                        localEntry.IsTombstone = false;
                        localEntry.ContentHash = remoteEntry.ContentHash;
                        localEntry.UpdatedAt = remoteEntry.UpdatedAt;
                    }
                }
                else if (!localEntry.IsTombstone && remoteEntry.IsTombstone)
                {
                    if (remoteEntry.UpdatedAt > localEntry.UpdatedAt)
                    {
                        var filePath = Path.Combine(_state.CurrentFolder, localEntry.RelativePath);
                        if (localEntry.IsDirectory && Directory.Exists(filePath)) Directory.Delete(filePath, true);
                        else if (!localEntry.IsDirectory && File.Exists(filePath)) File.Delete(filePath);

                        localEntry.IsTombstone = true;
                        localEntry.UpdatedAt = remoteEntry.UpdatedAt;
                    }
                    else
                    {
                        await PushFileToPeer(http, peerBaseUrl, localEntry.RelativePath, localEntry.IsDirectory);
                    }
                }
                else if (!localEntry.IsTombstone && !remoteEntry.IsTombstone)
                {
                    // Strict last-write-wins replacement (no conflict copies)
                    if (remoteEntry.UpdatedAt > localEntry.UpdatedAt)
                    {
                        await FetchAndSaveFile(http, peerBaseUrl, remoteEntry.RelativePath, remoteEntry.IsDirectory);
                        localEntry.ContentHash = remoteEntry.ContentHash;
                        localEntry.UpdatedAt = remoteEntry.UpdatedAt;
                    }
                    else
                    {
                        await PushFileToPeer(http, peerBaseUrl, localEntry.RelativePath, localEntry.IsDirectory);
                    }
                }
            }
            else if (hasLocal && !hasRemote)
            {
                if (!localEntry!.IsTombstone)
                    await PushFileToPeer(http, peerBaseUrl, localEntry.RelativePath, localEntry.IsDirectory);
            }
            else if (!hasLocal && hasRemote)
            {
                if (!remoteEntry!.IsTombstone)
                {
                    await FetchAndSaveFile(http, peerBaseUrl, remoteEntry.RelativePath, remoteEntry.IsDirectory);
                    localManifest.Files[Guid.NewGuid().ToString()] = new ManifestFileEntry
                    {
                        RelativePath = remoteEntry.RelativePath,
                        ContentHash = remoteEntry.ContentHash,
                        UpdatedAt = remoteEntry.UpdatedAt,
                        IsTombstone = false,
                        IsDirectory = remoteEntry.IsDirectory
                    };
                }
            }
        }

        SaveManifest(_state.CurrentFolder, localManifest);
    }

    private async Task FetchAndSaveFile(HttpClient http, string peerBaseUrl, string relativePath, bool isDirectory)
    {
        var path = Path.Combine(_state.CurrentFolder!, relativePath);
        if (isDirectory)
        {
            if (!Directory.Exists(path)) Directory.CreateDirectory(path);
            return;
        }

        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);

        var content =
            await http.GetStringAsync($"{peerBaseUrl}/api/rawfile?filename={Uri.EscapeDataString(relativePath)}");

        var isSynqHistory = relativePath.StartsWith(".synq/history/") || relativePath.StartsWith(".synq\\history\\");
        var isCommitsJson = relativePath.EndsWith("commits.json");
        var isSynqIndex = relativePath == ".synq/file_index.json" || relativePath == ".synq\\file_index.json";

        if (isSynqIndex)
        {
            await _vc.MergeFileIndexAsync(content);
            return;
        }

        if (isSynqHistory && isCommitsJson)
        {
            var uuid = relativePath.Split(new[] { '/', '\\' })[2];
            if (!Regex.IsMatch(uuid, "^[0-9a-f]{32}$")) return;
            await _vc.MergeCommitsJsonAsync(uuid, content);
            return;
        }

        var isDoc = relativePath.EndsWith(".md") || relativePath.EndsWith(".excalidraw");

        if (File.Exists(path) && isDoc) await _vc.CommitFileAsync(relativePath, "Auto-Save (Before Remote Sync)");

        File.WriteAllText(path, content);
        var doc = _documentManager.GetOrCreateDocument(relativePath);
        doc.OverwriteFromContent(content); // Update memory correctly!
        await _hubContext.Clients.All.SendAsync("DocumentUpdated", relativePath, content);

        if (isDoc) await _vc.CommitFileAsync(relativePath, "Auto-Save (Remote Sync)");
    }


    private async Task PushFileToPeer(HttpClient http, string peerBaseUrl, string relativePath, bool isDirectory)
    {
        var path = Path.Combine(_state.CurrentFolder!, relativePath);

        var content = "";
        if (!isDirectory && File.Exists(path))
            content = File.ReadAllText(path);
        else if (!isDirectory) return; // File missing

        if (isDirectory && !Directory.Exists(path)) return; // Dir missing

        var payload = new { filename = relativePath, content, isDirectory };
        var json = JsonSerializer.Serialize(payload);
        var reqContent = new StringContent(json, Encoding.UTF8, "application/json");
        await http.PostAsync($"{peerBaseUrl}/api/rawfile", reqContent);
    }
}
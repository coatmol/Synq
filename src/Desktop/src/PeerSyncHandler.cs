using System.Text.Json;
using Engine;
using Microsoft.AspNetCore.SignalR;

namespace Desktop;

public class PeerSyncHandler
{
    private readonly IHubContext<DocumentHub> _hubContext;
    private readonly DocumentManager _manager;
    private readonly PeerRouter _router;
    private readonly WorkspaceState _state;
    private readonly SyncManager _syncManager;

    public PeerSyncHandler(
        DocumentManager manager,
        SyncManager syncManager,
        WorkspaceState state,
        IHubContext<DocumentHub> hubContext,
        PeerRouter router)
    {
        _manager = manager;
        _syncManager = syncManager;
        _state = state;
        _hubContext = hubContext;
        _router = router;
    }

    public async Task HandleSyncNodes(string filename, List<CharNode> nodes)
    {
        var seq = _manager.GetOrCreateDocument(filename);
        foreach (var node in nodes) seq.RemoteMerge(node);
        _manager.SaveToDisk(filename);
        await _hubContext.Clients.All.SendAsync("DocumentUpdated", filename, seq.ToString());
    }

    public async Task HandleFileEvent(string eventName, JsonElement[] args)
    {
        switch (eventName)
        {
            case "ItemRenamed":
                if (args.Length >= 2)
                {
                    var oldPath = args[0].GetString();
                    var newPath = args[1].GetString();
                    var oldAbs = PathUtils.GetSafePath(_state.CurrentFolder, oldPath!);
                    var newAbs = PathUtils.GetSafePath(_state.CurrentFolder, newPath!);
                    if (oldAbs != null && newAbs != null)
                    {
                        if (File.Exists(oldAbs))
                        {
                            var dir = Path.GetDirectoryName(newAbs);
                            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                                Directory.CreateDirectory(dir);
                            File.Move(oldAbs, newAbs);
                        }
                        else if (Directory.Exists(oldAbs))
                        {
                            Directory.Move(oldAbs, newAbs);
                        }
                    }

                    _syncManager.InitializeLocalFolder();
                    await _hubContext.Clients.All.SendAsync("ItemRenamed", oldPath, newPath);
                }

                break;

            case "ItemDeleted":
                if (args.Length >= 1)
                {
                    var path = args[0].GetString();
                    var filePath = PathUtils.GetSafePath(_state.CurrentFolder, path!);
                    if (filePath != null)
                    {
                        if (File.Exists(filePath)) File.Delete(filePath);
                        else if (Directory.Exists(filePath)) Directory.Delete(filePath, true);
                    }

                    _syncManager.InitializeLocalFolder();
                    await _hubContext.Clients.All.SendAsync("ItemDeleted", path);
                }

                break;

            case "FileCreated":
                if (args.Length >= 1)
                {
                    var filename2 = args[0].GetString();
                    var fp = PathUtils.GetSafePath(_state.CurrentFolder, filename2!);
                    if (fp != null)
                    {
                        var dir = Path.GetDirectoryName(fp);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                            Directory.CreateDirectory(dir);
                        if (!File.Exists(fp))
                            await File.WriteAllTextAsync(fp,
                                "# " + Path.GetFileNameWithoutExtension(filename2));
                    }

                    _syncManager.InitializeLocalFolder();
                    await _hubContext.Clients.All.SendAsync("FileCreated", filename2);
                }

                break;

            case "FolderCreated":
                if (args.Length >= 1)
                {
                    var dirPath2 = args[0].GetString();
                    var dp = PathUtils.GetSafePath(_state.CurrentFolder, dirPath2!);
                    if (dp != null && !Directory.Exists(dp))
                        Directory.CreateDirectory(dp);
                    _syncManager.InitializeLocalFolder();
                    await _hubContext.Clients.All.SendAsync("FolderCreated", dirPath2);
                }

                break;
        }
    }

    /// <summary>
    ///     Handle a manifest request from a WAN peer —
    ///     serialize and send back over DataChannel.
    /// </summary>
    public async Task HandleManifestRequest(string fromPeerId)
    {
        var manifest = _syncManager.InitializeLocalFolder();
        var json = JsonSerializer.Serialize(manifest);
        await _router.SendToAsync(fromPeerId, new MeshEnvelope
        {
            Type = MeshMessageType.MANIFEST_RESPONSE,
            SenderId = _router.LocalPeerId,
            Payload = json
        });
    }

    public async Task HandleManifestResponse(string fromPeerId, string payload)
    {
        var remoteManifest = JsonSerializer.Deserialize<SyncManifest>(payload);
        if (remoteManifest == null || string.IsNullOrEmpty(_state.CurrentFolder)) return;

        var localManifest = _syncManager.InitializeLocalFolder();
        var allPaths = localManifest.Files.Values.Select(v => v.RelativePath)
            .Union(remoteManifest.Files.Values.Select(v => v.RelativePath))
            .Distinct();

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
                        // We deleted it more recently, tell remote to delete
                        await _router.SendToAsync(fromPeerId, new MeshEnvelope
                        {
                            Type = MeshMessageType.FILE_EVENT,
                            SenderId = _router.LocalPeerId,
                            Payload = JsonSerializer.Serialize(new
                                { @event = "ItemDeleted", args = new[] { remoteEntry.RelativePath } })
                        });
                    else
                        // They have a newer file, request it
                        await _router.SendToAsync(fromPeerId, new MeshEnvelope
                        {
                            Type = MeshMessageType.FILE_REQUEST,
                            SenderId = _router.LocalPeerId,
                            Payload = remoteEntry.RelativePath
                        });
                }
                else if (!localEntry.IsTombstone && remoteEntry.IsTombstone)
                {
                    if (remoteEntry.UpdatedAt > localEntry.UpdatedAt)
                    {
                        // They deleted it more recently, delete ours
                        var filePath = Path.Combine(_state.CurrentFolder, localEntry.RelativePath);
                        if (localEntry.IsDirectory && Directory.Exists(filePath)) Directory.Delete(filePath, true);
                        else if (!localEntry.IsDirectory && File.Exists(filePath)) File.Delete(filePath);

                        localEntry.IsTombstone = true;
                        localEntry.UpdatedAt = remoteEntry.UpdatedAt;
                    }
                    else
                    {
                        // We have a newer file, push it
                        await PushFileToWanPeer(fromPeerId, localEntry.RelativePath, localEntry.IsDirectory);
                    }
                }
                else if (!localEntry.IsTombstone && !remoteEntry.IsTombstone)
                {
                    if (remoteEntry.UpdatedAt > localEntry.UpdatedAt)
                        // They have newer version, request it
                        await _router.SendToAsync(fromPeerId, new MeshEnvelope
                        {
                            Type = MeshMessageType.FILE_REQUEST,
                            SenderId = _router.LocalPeerId,
                            Payload = remoteEntry.RelativePath
                        });
                    else
                        // We have newer version, push it
                        await PushFileToWanPeer(fromPeerId, localEntry.RelativePath, localEntry.IsDirectory);
                }
            }
            else if (hasLocal && !hasRemote)
            {
                if (!localEntry!.IsTombstone)
                    // They are missing it, push it
                    await PushFileToWanPeer(fromPeerId, localEntry.RelativePath, localEntry.IsDirectory);
            }
            else if (!hasLocal && hasRemote)
            {
                if (!remoteEntry!.IsTombstone)
                    // We are missing it, request it
                    await _router.SendToAsync(fromPeerId, new MeshEnvelope
                    {
                        Type = MeshMessageType.FILE_REQUEST,
                        SenderId = _router.LocalPeerId,
                        Payload = remoteEntry.RelativePath
                    });
            }
        }

        // Use reflection or make SaveManifest public? SyncManager handles SaveManifest.
        // For simplicity, we just rely on the next Initialization/Save or we can just let HandleFileResponse update the manifest when the files arrive.
    }

    private async Task PushFileToWanPeer(string toPeerId, string relativePath, bool isDirectory)
    {
        var path = Path.Combine(_state.CurrentFolder!, relativePath);
        var content = "";
        if (!isDirectory && File.Exists(path))
            content = await File.ReadAllTextAsync(path);
        else if (!isDirectory) return;

        if (isDirectory && !Directory.Exists(path)) return;

        await _router.SendToAsync(toPeerId, new MeshEnvelope
        {
            Type = MeshMessageType.FILE_RESPONSE,
            SenderId = _router.LocalPeerId,
            Payload = JsonSerializer.Serialize(new { filename = relativePath, content, isDirectory })
        });
    }

    public async Task HandleFileRequest(string fromPeerId, string filename)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;
        var path = PathUtils.GetSafePath(_state.CurrentFolder, filename);
        if (path != null && File.Exists(path))
        {
            var content = await File.ReadAllTextAsync(path);
            await _router.SendToAsync(fromPeerId, new MeshEnvelope
            {
                Type = MeshMessageType.FILE_RESPONSE,
                SenderId = _router.LocalPeerId,
                Payload = JsonSerializer.Serialize(new { filename, content })
            });
        }
    }

    public async Task HandleFileResponse(string payload)
    {
        var data = JsonSerializer.Deserialize<JsonElement>(payload);
        var filename = data.GetProperty("filename").GetString();

        var isDirectory = false;
        if (data.TryGetProperty("isDirectory", out var isDirProp))
            isDirectory = isDirProp.GetBoolean();

        if (filename != null && !string.IsNullOrEmpty(_state.CurrentFolder))
        {
            var path = PathUtils.GetSafePath(_state.CurrentFolder, filename);
            if (path != null)
            {
                if (isDirectory)
                {
                    if (!Directory.Exists(path)) Directory.CreateDirectory(path);
                    return;
                }

                var content = data.GetProperty("content").GetString();
                if (content != null)
                {
                    var dir = Path.GetDirectoryName(path);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        Directory.CreateDirectory(dir);
                    await File.WriteAllTextAsync(path, content);
                    _manager.GetOrCreateDocument(filename);
                }
            }
        }
    }
}
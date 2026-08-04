using System.Text.Json;
using Engine;
using Microsoft.AspNetCore.SignalR;

namespace Desktop;

public class PeerSyncHandler
{
    private readonly DocumentManager _manager;
    private readonly SyncManager _syncManager;
    private readonly WorkspaceState _state;
    private readonly IHubContext<DocumentHub> _hubContext;
    private readonly PeerRouter _router;

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
                            Directory.Move(oldAbs, newAbs);
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
    /// Handle a manifest request from a WAN peer —
    /// serialize and send back over DataChannel.
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
        // Process remote manifest without HTTP — file transfer uses
        // FILE_REQUEST / FILE_RESPONSE over DataChannel
        var remoteManifest = JsonSerializer.Deserialize<SyncManifest>(payload);
        if (remoteManifest != null)
        {
            // For WAN: we can't use HTTP to fetch files, so we request them
            // over DataChannel using FILE_REQUEST messages.
            // (Implementation deferred to full mesh sync phase)
        }
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
        var content = data.GetProperty("content").GetString();
        if (filename != null && content != null && !string.IsNullOrEmpty(_state.CurrentFolder))
        {
            var path = PathUtils.GetSafePath(_state.CurrentFolder, filename);
            if (path != null)
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

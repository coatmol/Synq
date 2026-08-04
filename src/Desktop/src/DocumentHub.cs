using Engine;
using Microsoft.AspNetCore.SignalR;

namespace Desktop;

public class DocumentHub : Hub
{
    private readonly DocumentManager _manager;
    private readonly PeerRouter _router;

    public DocumentHub(DocumentManager manager, PeerRouter router)
    {
        _manager = manager;
        _router = router;
    }

    public async Task InsertCharacter(string filename, int index, char value)
    {
        var seq = _manager.GetOrCreateDocument(filename);
        var node = seq.LocalInsert(index, value);
        _manager.SaveToDisk(filename);
        await Clients.Others.SendAsync("DocumentUpdated", filename, seq.ToString());
        await Clients.Others.SendAsync("SyncNodes", filename, new List<CharNode> { node });
        await _router.BroadcastSyncNodesAsync(filename, new List<CharNode> { node });
    }

    public async Task InsertText(string filename, int index, string value)
    {
        var seq = _manager.GetOrCreateDocument(filename);
        var nodes = seq.LocalInsert(index, value);
        _manager.SaveToDisk(filename);
        await Clients.Others.SendAsync("DocumentUpdated", filename, seq.ToString());
        await Clients.Others.SendAsync("SyncNodes", filename, nodes);
        await _router.BroadcastSyncNodesAsync(filename, nodes);
    }

    public async Task DeleteCharacter(string filename, int index)
    {
        var seq = _manager.GetOrCreateDocument(filename);
        var node = seq.LocalDelete(index);
        _manager.SaveToDisk(filename);
        await Clients.Others.SendAsync("DocumentUpdated", filename, seq.ToString());
        if (node != null)
        {
            await Clients.Others.SendAsync("SyncNodes", filename, new List<CharNode> { node.Value });
            await _router.BroadcastSyncNodesAsync(filename, new List<CharNode> { node.Value });
        }
    }

    public async Task DeleteText(string filename, int index, int length)
    {
        var seq = _manager.GetOrCreateDocument(filename);
        var nodes = seq.LocalDelete(index, length);
        _manager.SaveToDisk(filename);
        await Clients.Others.SendAsync("DocumentUpdated", filename, seq.ToString());
        await Clients.Others.SendAsync("SyncNodes", filename, nodes);
        await _router.BroadcastSyncNodesAsync(filename, nodes);
    }

    public async Task SyncNodes(string filename, List<CharNode> nodes)
    {
        var seq = _manager.GetOrCreateDocument(filename);
        foreach (var node in nodes) seq.RemoteMerge(node);
        _manager.SaveToDisk(filename);
        await Clients.Others.SendAsync("DocumentUpdated", filename, seq.ToString());
        await Clients.Others.SendAsync("SyncNodes", filename, nodes);
    }

    public async Task ItemRenamed(string oldPath, string newPath)
    {
        await Clients.Others.SendAsync("ItemRenamed", oldPath, newPath);
    }

    public async Task ItemDeleted(string path)
    {
        await Clients.Others.SendAsync("ItemDeleted", path);
    }

    public async Task FileCreated(string filename)
    {
        await Clients.Others.SendAsync("FileCreated", filename);
    }

    public async Task FolderCreated(string path)
    {
        await Clients.Others.SendAsync("FolderCreated", path);
    }
}
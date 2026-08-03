using System.Collections.Concurrent;
using Engine;

namespace Desktop;

public class DocumentManager
{
    private readonly ConcurrentDictionary<string, TextSequence> _documents = new();
    private readonly string _peerId;
    private readonly WorkspaceState _state;

    public DocumentManager(WorkspaceState state)
    {
        _state = state;
        _peerId = Environment.MachineName;
    }

    public TextSequence GetOrCreateDocument(string filename)
    {
        return _documents.GetOrAdd(filename, key =>
        {
            var doc = new TextSequence(_peerId);
            if (!string.IsNullOrEmpty(_state.CurrentFolder))
            {
                var path = PathUtils.GetSafePath(_state.CurrentFolder, key);
                if (path != null && File.Exists(path))
                {
                    var content = File.ReadAllText(path);
                    if (!string.IsNullOrEmpty(content)) doc.LocalInsert(0, content);
                }
            }

            return doc;
        });
    }

    public void SaveToDisk(string filename)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;
        if (_documents.TryGetValue(filename, out var doc))
        {
            var path = PathUtils.GetSafePath(_state.CurrentFolder, filename);
            if (path != null) File.WriteAllText(path, doc.ToString());
        }
    }

    public void LoadAllFromDisk()
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;
        var files = Directory.GetFiles(_state.CurrentFolder, "*.md").Select(Path.GetFileName);
        foreach (var file in files) GetOrCreateDocument(file!);
    }

    public Dictionary<string, string> GetAllFilesContent()
    {
        var result = new Dictionary<string, string>();
        foreach (var doc in _documents)
            result[doc.Key] = doc.Value.ToString();
        return result;
    }

    public void OverwriteFromSync(Dictionary<string, string> contents)
    {
        if (string.IsNullOrEmpty(_state.CurrentFolder)) return;
        foreach (var kvp in contents)
        {
            var path = Path.Combine(_state.CurrentFolder, kvp.Key);
            File.WriteAllText(path, kvp.Value);
            var doc = new TextSequence(_peerId);
            if (!string.IsNullOrEmpty(kvp.Value)) doc.LocalInsert(0, kvp.Value);
            _documents[kvp.Key] = doc;
        }
    }
}
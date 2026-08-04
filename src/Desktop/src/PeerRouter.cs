using System.Collections.Concurrent;
using Engine;

namespace Desktop;

public class PeerRouter
{
    private readonly ConcurrentDictionary<string, IPeerTransport> _transports = new();

    public PeerRouter(WorkspaceState state)
    {
        LocalPeerId = state.Settings.Username + "-" + Environment.MachineName;
    }

    public string LocalPeerId { get; }

    public void Register(IPeerTransport transport)
        => _transports[transport.TransportId] = transport;

    public void Unregister(string transportId)
        => _transports.TryRemove(transportId, out _);

    public IReadOnlyCollection<IPeerTransport> GetAll()
        => _transports.Values.ToList().AsReadOnly();

    public IPeerTransport? Get(string transportId)
        => _transports.GetValueOrDefault(transportId);

    public async Task BroadcastSyncNodesAsync(string filename, List<CharNode> nodes)
    {
        foreach (var t in _transports.Values.Where(t => t.IsConnected))
            try
            {
                await t.SendSyncNodesAsync(filename, nodes);
            }
            catch
            {
                /* log */
            }
    }

    public async Task BroadcastFileEventAsync(string eventName, params object[] args)
    {
        foreach (var t in _transports.Values.Where(t => t.IsConnected))
            try
            {
                await t.SendFileEventAsync(eventName, args);
            }
            catch
            {
                /* log */
            }
    }

    public async Task SendToAsync(string peerId, MeshEnvelope envelope)
    {
        if (_transports.TryGetValue(peerId, out var t) && t.IsConnected)
            await t.SendEnvelopeAsync(envelope);
    }

    public async Task BroadcastEnvelopeAsync(MeshEnvelope envelope)
    {
        foreach (var t in _transports.Values.Where(t => t.IsConnected))
            try
            {
                await t.SendEnvelopeAsync(envelope);
            }
            catch
            {
                /* log */
            }
    }
}
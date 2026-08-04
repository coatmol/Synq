using Engine;

namespace Desktop;

public interface IPeerTransport
{
    string TransportId { get; }
    Task SendSyncNodesAsync(string filename, List<CharNode> nodes);
    Task SendFileEventAsync(string eventName, params object[] args);
    Task SendEnvelopeAsync(MeshEnvelope envelope);
    bool IsConnected { get; }
}

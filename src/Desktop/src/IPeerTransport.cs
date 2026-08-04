using Engine;

namespace Desktop;

public interface IPeerTransport
{
    string TransportId { get; }
    bool IsConnected { get; }
    Task SendSyncNodesAsync(string filename, List<CharNode> nodes);
    Task SendFileEventAsync(string eventName, params object[] args);
    Task SendEnvelopeAsync(MeshEnvelope envelope);
}
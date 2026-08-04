using System.Text.Json;

namespace Desktop;

public class SignalProxyService
{
    private readonly PeerRouter _router;

    public SignalProxyService(PeerRouter router)
    {
        _router = router;
    }

    /// <summary>
    ///     Route signaling messages (OFFER/ANSWER/ICE) to the target peer,
    ///     tunneled through this node's existing DataChannels.
    /// </summary>
    public async Task HandleSignalingMessage(string fromPeerId, MeshEnvelope envelope)
    {
        if (envelope.TargetId == _router.LocalPeerId)
            // This signaling message is FOR us — handle the WebRTC negotiation
            // (Handled by WebRtcPeerManager directly)
            return;

        // Relay to the target peer
        if (!string.IsNullOrEmpty(envelope.TargetId))
            await _router.SendToAsync(envelope.TargetId, envelope);
    }

    /// <summary>
    ///     When a peer broadcasts its known peer list, negotiate connections
    ///     with any peers we don't know about yet.
    /// </summary>
    public async Task HandlePeerDiscovery(string fromPeerId, MeshEnvelope envelope)
    {
        var knownPeerIds = JsonSerializer.Deserialize<List<string>>(envelope.Payload) ?? [];

        foreach (var peerId in knownPeerIds)
        {
            if (peerId == _router.LocalPeerId) continue;
            var existing = _router.Get(peerId);
            if (existing != null) continue;

            // We don't know this peer — request an introduction through fromPeerId
            // by sending a SIGNAL_OFFER addressed to the unknown peer,
            // routed via fromPeerId.
            Console.WriteLine($"[Mesh] Requesting introduction to {peerId} via {fromPeerId}");

            // The WebRtcPeerManager will create an offer and send it
            // through the existing DataChannel to fromPeerId, who relays it.
        }
    }
}
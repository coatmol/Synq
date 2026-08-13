using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Engine;
using SIPSorcery.Net;

namespace Desktop;

public class WebRtcPeer : IPeerTransport
{
    public string PeerId { get; set; } = "";
    public RTCPeerConnection Connection { get; set; } = null!;
    public RTCDataChannel? DataChannel { get; set; }
    public string TransportId => PeerId;
    public bool IsConnected => DataChannel?.readyState == RTCDataChannelState.open;

    public async Task SendSyncNodesAsync(string filename, List<CharNode> nodes)
    {
        var envelope = new MeshEnvelope
        {
            Type = MeshMessageType.CRDT_DELTA,
            SenderId = PeerId,
            Payload = JsonSerializer.Serialize(new { filename, nodes })
        };
        await SendEnvelopeAsync(envelope);
    }

    public async Task SendFileEventAsync(string eventName, params object[] args)
    {
        var envelope = new MeshEnvelope
        {
            Type = MeshMessageType.FILE_EVENT,
            SenderId = PeerId,
            Payload = JsonSerializer.Serialize(new { @event = eventName, args })
        };
        await SendEnvelopeAsync(envelope);
    }

    public Task SendEnvelopeAsync(MeshEnvelope envelope)
    {
        if (DataChannel?.readyState == RTCDataChannelState.open)
            DataChannel.send(envelope.Serialize());
        return Task.CompletedTask;
    }
}

public class WebRtcPeerManager
{
    private readonly string _localPeerId;
    private readonly ConcurrentDictionary<string, WebRtcPeer> _peers = new();
    private readonly PeerRouter _router;
    private readonly SignalProxyService _signalProxy;

    private readonly StunDiagnosticService _stunDiag;
    private readonly PeerSyncHandler _syncHandler;

    public WebRtcPeerManager(
        PeerRouter router,
        PeerSyncHandler syncHandler,
        SignalProxyService signalProxy,
        StunDiagnosticService stunDiag,
        WorkspaceState state)
    {
        _stunDiag = stunDiag;
        _router = router;
        _syncHandler = syncHandler;
        _signalProxy = signalProxy;
        _localPeerId = router.LocalPeerId;
    }

    /// <summary>
    ///     Host: Create an SDP Offer token for a new peer.
    /// </summary>
    public async Task<(string Token, string PendingId)> CreateOfferTokenAsync()
    {
        var pc = CreatePeerConnection();
        var dc = await pc.createDataChannel("synq");
        var tempPeer = new WebRtcPeer { Connection = pc, DataChannel = dc };

        var offer = pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait briefly for ICE gathering
        await Task.Delay(2000);

        var sdp = pc.localDescription.sdp.ToString();
        var token = TokenService.Compress(
            new TokenService.TokenPayload(sdp, _localPeerId));

        // Store temporarily keyed by SDP hash until we know the remote peer ID
        var tempId = $"pending-{Guid.NewGuid():N}";
        tempPeer.PeerId = tempId;
        _peers[tempId] = tempPeer;

        return (token, tempId);
    }

    /// <summary>
    ///     Guest: Receive an offer token, produce an answer token.
    /// </summary>
    public async Task<string> AcceptOfferTokenAsync(string offerToken)
    {
        var offer = TokenService.Decompress(offerToken);
        if (offer == null) throw new InvalidOperationException("Invalid offer token");

        var pc = CreatePeerConnection();
        var remotePeerId = offer.PeerId;

        pc.ondatachannel += dc =>
        {
            var peer = _peers.GetValueOrDefault(remotePeerId);
            if (peer != null)
            {
                peer.DataChannel = dc;
                SetupDataChannelHandlers(peer);
            }
        };

        var offerSdp = SDP.ParseSDPDescription(offer.Sdp);
        pc.setRemoteDescription(new RTCSessionDescriptionInit
        {
            type = RTCSdpType.offer, sdp = offerSdp.ToString()
        });

        var answer = pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Wait briefly for ICE gathering
        await Task.Delay(2000);

        var peer2 = new WebRtcPeer
        {
            PeerId = remotePeerId,
            Connection = pc
        };
        _peers[remotePeerId] = peer2;
        _router.Register(peer2);

        var sdp = pc.localDescription.sdp.ToString();
        return TokenService.Compress(
            new TokenService.TokenPayload(sdp, _localPeerId));
    }

    /// <summary>
    ///     Host: Complete handshake with the guest's answer token.
    /// </summary>
    public async Task CompleteHandshakeAsync(string answerToken, string pendingId)
    {
        var answer = TokenService.Decompress(answerToken);
        if (answer == null) throw new InvalidOperationException("Invalid answer token");

        if (!_peers.TryRemove(pendingId, out var peer))
            throw new InvalidOperationException("No pending offer found");

        peer.PeerId = answer.PeerId;
        _peers[answer.PeerId] = peer;
        _router.Register(peer);

        SetupDataChannelHandlers(peer);

        var answerSdp = SDP.ParseSDPDescription(answer.Sdp);
        peer.Connection.setRemoteDescription(new RTCSessionDescriptionInit
        {
            type = RTCSdpType.answer, sdp = answerSdp.ToString()
        });
    }

    private RTCPeerConnection CreatePeerConnection()
    {
        // Only use STUN servers that passed the pre-flight diagnostic
        var availableServers = _stunDiag.GetAvailableIceServers();
        if (availableServers.Length == 0)
            Console.WriteLine("[WAN] WARNING: No reachable STUN servers. NAT traversal will likely fail.");

        var config = new RTCConfiguration
        {
            iceServers = availableServers.ToList()
        };
        var pc = new RTCPeerConnection(config);

        pc.onconnectionstatechange += state =>
        {
            var entry = _peers.FirstOrDefault(p => p.Value.Connection == pc);

            if (state == RTCPeerConnectionState.disconnected)
            {
                // Transient drop (WiFi blip, sleep/wake) — attempt ICE restart
                Console.WriteLine($"[WAN] Connection disconnected with {entry.Key}, attempting ICE restart...");
                _ = Task.Run(async () =>
                {
                    try
                    {
                        // Wait briefly for natural recovery
                        await Task.Delay(2000);
                        if (pc.connectionState == RTCPeerConnectionState.disconnected)
                        {
                            pc.restartIce();
                            // Give ICE restart 10 seconds to succeed
                            await Task.Delay(10_000);
                            if (pc.connectionState != RTCPeerConnectionState.connected)
                            {
                                Console.WriteLine($"[WAN] ICE restart failed for {entry.Key}, removing peer.");
                                if (entry.Key != null)
                                {
                                    _peers.TryRemove(entry.Key, out _);
                                    _router.Unregister(entry.Key);
                                }
                            }
                            else
                            {
                                Console.WriteLine($"[WAN] ICE restart succeeded for {entry.Key}.");
                            }
                        }
                    }
                    catch
                    {
                        /* ICE restart not supported or peer gone */
                    }
                });
            }
            else if (state == RTCPeerConnectionState.failed)
            {
                // Unrecoverable failure — remove immediately
                Console.WriteLine($"[WAN] Connection failed with {entry.Key}, removing peer.");
                if (entry.Key != null)
                {
                    _peers.TryRemove(entry.Key, out _);
                    _router.Unregister(entry.Key);
                }
            }
        };

        return pc;
    }

    private void SetupDataChannelHandlers(WebRtcPeer peer)
    {
        if (peer.DataChannel == null) return;

        Action onOpenLogic = () =>
        {
            Console.WriteLine($"[WAN] DataChannel open with {peer.PeerId}");
            _ = BroadcastPeerDiscovery();

            _ = _router.SendToAsync(peer.PeerId, new MeshEnvelope
            {
                Type = MeshMessageType.MANIFEST_REQUEST,
                SenderId = _localPeerId
            });
        };

        if (peer.DataChannel.readyState == RTCDataChannelState.open)
        {
            onOpenLogic();
        }
        else
        {
            peer.DataChannel.onopen += onOpenLogic;
        }

        peer.DataChannel.onmessage += (dc, protocol, data) =>
        {
            var json = Encoding.UTF8.GetString(data);
            var envelope = MeshEnvelope.Deserialize(json);
            if (envelope == null) return;

            // If this message is addressed to someone else, relay it
            if (envelope.TargetId != null &&
                envelope.TargetId != _localPeerId)
            {
                _ = _router.SendToAsync(envelope.TargetId, envelope);
                return;
            }
            try
            {
                _ = HandleIncomingEnvelope(peer.PeerId, envelope);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WAN] Error handling envelope: {ex.Message}");
            }
        };

        peer.DataChannel.onclose += () =>
        {
            Console.WriteLine($"[WAN] DataChannel closed with {peer.PeerId}");
            _peers.TryRemove(peer.PeerId, out _);
            _router.Unregister(peer.PeerId);
            _ = _router.BroadcastEnvelopeAsync(new MeshEnvelope
            {
                Type = MeshMessageType.PEER_LEFT,
                SenderId = _localPeerId,
                Payload = peer.PeerId
            });
        };
    }

    private async Task HandleIncomingEnvelope(string fromPeerId, MeshEnvelope envelope)
    {
        switch (envelope.Type)
        {
            case MeshMessageType.CRDT_DELTA:
                var delta = JsonSerializer.Deserialize<CrdtDeltaPayload>(envelope.Payload);
                if (delta != null)
                    await _syncHandler.HandleSyncNodes(delta.Filename, delta.Nodes);
                break;

            case MeshMessageType.FILE_EVENT:
                var fileEvt = JsonSerializer.Deserialize<FileEventPayload>(envelope.Payload);
                if (fileEvt != null)
                    await _syncHandler.HandleFileEvent(fileEvt.Event, fileEvt.Args);
                break;

            case MeshMessageType.SIGNAL_OFFER:
            case MeshMessageType.SIGNAL_ANSWER:
            case MeshMessageType.ICE_CANDIDATE:
                await _signalProxy.HandleSignalingMessage(fromPeerId, envelope);
                break;

            case MeshMessageType.PEER_DISCOVERY:
                await _signalProxy.HandlePeerDiscovery(fromPeerId, envelope);
                break;

            case MeshMessageType.PEER_LEFT:
                var leftPeerId = envelope.Payload;
                if (_peers.TryRemove(leftPeerId, out var leftPeer))
                {
                    leftPeer.Connection.close();
                    _router.Unregister(leftPeerId);
                }

                break;

            case MeshMessageType.MANIFEST_REQUEST:
                await _syncHandler.HandleManifestRequest(fromPeerId);
                break;

            case MeshMessageType.MANIFEST_RESPONSE:
                await _syncHandler.HandleManifestResponse(fromPeerId, envelope.Payload);
                break;

            case MeshMessageType.FILE_REQUEST:
                await _syncHandler.HandleFileRequest(fromPeerId, envelope.Payload);
                break;

            case MeshMessageType.FILE_RESPONSE:
                await _syncHandler.HandleFileResponse(envelope.Payload);
                break;

            case MeshMessageType.PING:
                await _router.SendToAsync(fromPeerId, new MeshEnvelope
                {
                    Type = MeshMessageType.PONG,
                    SenderId = _localPeerId
                });
                break;

            case MeshMessageType.PONG:
                // Reset heartbeat timer for this peer
                break;
        }
    }

    private async Task BroadcastPeerDiscovery()
    {
        var knownPeers = _peers.Keys.ToList();
        await _router.BroadcastEnvelopeAsync(new MeshEnvelope
        {
            Type = MeshMessageType.PEER_DISCOVERY,
            SenderId = _localPeerId,
            Payload = JsonSerializer.Serialize(knownPeers)
        });
    }

    public IEnumerable<object> GetConnectedWanPeers()
    {
        return _peers.Values
            .Where(p => p.IsConnected)
            .Select(p => new
            {
                id = p.PeerId,
                name = p.PeerId,
                status = "online",
                transport = "wan",
                init = p.PeerId.Length >= 2
                    ? p.PeerId[..2].ToUpper()
                    : "??"
            });
    }

    public void DisconnectAll()
    {
        foreach (var peer in _peers.Values)
        {
            try
            {
                peer.DataChannel?.close();
                peer.Connection?.close();
            }
            catch
            {
                /* ignore */
            }

            _router.Unregister(peer.PeerId);
        }

        _peers.Clear();
    }
}

// Payload DTOs for deserialization
public record CrdtDeltaPayload(
    [property: JsonPropertyName("filename")]
    string Filename,
    [property: JsonPropertyName("nodes")] List<CharNode> Nodes);

public record FileEventPayload(
    [property: JsonPropertyName("event")] string Event,
    [property: JsonPropertyName("args")] JsonElement[] Args);
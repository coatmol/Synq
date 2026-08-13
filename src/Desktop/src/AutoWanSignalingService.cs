using System.Buffers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using MQTTnet;

namespace Desktop;

public class AutoWanSignalingMessage
{
    [JsonPropertyName("type")] public string Type { get; set; } = string.Empty; // "announce", "offer", "answer"
    [JsonPropertyName("senderId")] public string SenderId { get; set; } = string.Empty;
    [JsonPropertyName("targetId")] public string TargetId { get; set; } = string.Empty;
    [JsonPropertyName("payload")] public string Payload { get; set; } = string.Empty;
}

public class AutoWanSignalingService : IDisposable
{
    private readonly IMqttClient _mqttClient;
    private readonly WorkspaceState _state;
    private readonly SyncManager _syncManager;
    private readonly WebRtcPeerManager _wrtc;
    private readonly PeerRouter _router;
    private string _currentTopic = string.Empty;
    private byte[] _encryptionKey = Array.Empty<byte>();
    private readonly string _signalingClientId = $"synq_{Guid.NewGuid():N}";
    
    // Track pending outgoing offers to match with answers
    private readonly Dictionary<string, string> _pendingOffers = new(); // TargetId -> PendingId

    public AutoWanSignalingService(WorkspaceState state, SyncManager syncManager, WebRtcPeerManager wrtc, PeerRouter router)
    {
        _state = state;
        _syncManager = syncManager;
        _wrtc = wrtc;
        _router = router;
        
        var factory = new MqttClientFactory();
        _mqttClient = factory.CreateMqttClient();
        
        _mqttClient.ApplicationMessageReceivedAsync += OnMessageReceived;
        _mqttClient.ConnectedAsync += async e =>
        {
            if (!string.IsNullOrEmpty(_currentTopic))
            {
                await _mqttClient.SubscribeAsync(_currentTopic);
                await BroadcastAnnounceAsync();
            }
        };

        _mqttClient.DisconnectedAsync += async e =>
        {
            // Auto reconnect logic
            await Task.Delay(5000);
            if (!_mqttClient.IsConnected && !string.IsNullOrEmpty(_currentTopic))
            {
                try
                {
                    await _mqttClient.ConnectAsync(_mqttClient.Options);
                }
                catch { }
            }
        };

        _state.FolderChanged += OnFolderChanged;
        
        // Initial setup
        _ = Task.Run(async () =>
        {
            await Task.Delay(2000); // Wait for other services to initialize
            OnFolderChanged();
        });
    }

    private void OnFolderChanged()
    {
        _ = ReconnectToRoomAsync();
    }
    
    private async Task ReconnectToRoomAsync()
    {
        var folder = _state.CurrentFolder;
        if (string.IsNullOrEmpty(folder)) return;
        
        var manifest = _syncManager.LoadManifest(folder);
        if (string.IsNullOrEmpty(manifest.WanNetworkId)) return;
        
        // Derive AES key
        using var sha256 = SHA256.Create();
        _encryptionKey = sha256.ComputeHash(Encoding.UTF8.GetBytes(manifest.WanNetworkId + "SynqSignaling"));
        
        // Derive public topic
        var topicHash = Convert.ToHexString(sha256.ComputeHash(Encoding.UTF8.GetBytes(manifest.WanNetworkId + "Topic"))).ToLower();
        var newTopic = $"synq/room/{topicHash}";
        
        if (_currentTopic == newTopic && _mqttClient.IsConnected) return;
        
        if (_mqttClient.IsConnected)
        {
            if (!string.IsNullOrEmpty(_currentTopic))
                await _mqttClient.UnsubscribeAsync(_currentTopic);
        }
        else
        {
            var options = new MqttClientOptionsBuilder()
                .WithWebSocketServer(o => o.WithUri("ws://broker.emqx.io:8083/mqtt"))
                .WithClientId($"synq_{Guid.NewGuid():N}")
                .Build();
                
            try
            {
                await _mqttClient.ConnectAsync(options);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MQTT] Failed to connect: {ex.Message}");
                return;
            }
        }
        
        _currentTopic = newTopic;
        await _mqttClient.SubscribeAsync(_currentTopic);
        Console.WriteLine($"[MQTT] Subscribed to WAN room {_currentTopic}");
        
        await BroadcastAnnounceAsync();
    }
    
    private async Task BroadcastAnnounceAsync()
    {
        var msg = new AutoWanSignalingMessage
        {
            Type = "announce",
            SenderId = _signalingClientId
        };
        await PublishEncryptedAsync(msg);
    }
    
    private async Task OnMessageReceived(MqttApplicationMessageReceivedEventArgs e)
    {
        try
        {
            var payloadArray = e.ApplicationMessage.Payload.ToArray();
            var decrypted = Decrypt(payloadArray);
            if (decrypted == null) return;
            
            var msg = JsonSerializer.Deserialize<AutoWanSignalingMessage>(decrypted);
            if (msg == null || msg.SenderId == _signalingClientId) return;
            
            Console.WriteLine($"[MQTT] Received {msg.Type} from {msg.SenderId}");
            
            if (msg.Type == "announce")
            {
                // Update Known WAN Peers
                UpdateKnownPeer(msg.SenderId, "WAN Peer"); // Could add actual name in announce if needed

                // We received an announce. If we have a smaller ID, we initiate the offer to break ties.
                if (string.Compare(_signalingClientId, msg.SenderId, StringComparison.Ordinal) <= 0) return;

                var token = await _wrtc.CreateOfferTokenAsync();
                var pendingId = Guid.NewGuid().ToString("N");
                
                var offerMsg = new AutoWanSignalingMessage
                {
                    Type = "offer",
                    SenderId = _signalingClientId,
                    TargetId = msg.SenderId,
                    Payload = JsonSerializer.Serialize(new { token, pendingId })
                };
                _pendingOffers[msg.SenderId] = pendingId;
                await PublishEncryptedAsync(offerMsg);
            }
            else if (msg.Type == "offer" && msg.TargetId == _signalingClientId)
            {
                var payload = JsonSerializer.Deserialize<JsonElement>(msg.Payload);
                var offerToken = payload.GetProperty("token").GetString();
                var pendingId = payload.GetProperty("pendingId").GetString();
                
                var answerToken = await _wrtc.AcceptOfferTokenAsync(offerToken!);
                var answerMsg = new AutoWanSignalingMessage
                {
                    Type = "answer",
                    SenderId = _signalingClientId,
                    TargetId = msg.SenderId,
                    Payload = JsonSerializer.Serialize(new { token = answerToken, pendingId })
                };
                await PublishEncryptedAsync(answerMsg);
            }
            else if (msg.Type == "answer" && msg.TargetId == _signalingClientId)
            {
                var payload = JsonSerializer.Deserialize<JsonElement>(msg.Payload);
                var answerToken = payload.GetProperty("token").GetString();
                var pendingId = payload.GetProperty("pendingId").GetString();
                
                if (_pendingOffers.TryGetValue(msg.SenderId, out var expectedPendingId) && expectedPendingId == pendingId)
                {
                    await _wrtc.CompleteHandshakeAsync(answerToken!, pendingId!);
                    _pendingOffers.Remove(msg.SenderId);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[MQTT] Message error: {ex.Message}");
        }
    }
    
    private void UpdateKnownPeer(string peerId, string name)
    {
        var folder = _state.CurrentFolder;
        if (string.IsNullOrEmpty(folder)) return;
        var manifest = _syncManager.LoadManifest(folder);
        if (!manifest.KnownWanPeers.ContainsKey(peerId))
        {
            manifest.KnownWanPeers[peerId] = new KnownWanPeer { PeerId = peerId, Name = name };
        }
        manifest.KnownWanPeers[peerId].LastSeen = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        _syncManager.SaveManifest(folder, manifest);
    }

    private async Task PublishEncryptedAsync(AutoWanSignalingMessage msg)
    {
        var json = JsonSerializer.Serialize(msg);
        var encrypted = Encrypt(json);
        
        var message = new MqttApplicationMessageBuilder()
            .WithTopic(_currentTopic)
            .WithPayload(encrypted)
            .Build();
            
        await _mqttClient.PublishAsync(message);
    }
    
    private byte[] Encrypt(string plainText)
    {
        using var aes = Aes.Create();
        aes.Key = _encryptionKey;
        aes.GenerateIV();
        
        var cipher = aes.EncryptCbc(Encoding.UTF8.GetBytes(plainText), aes.IV);
        var result = new byte[aes.IV.Length + cipher.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipher, 0, result, aes.IV.Length, cipher.Length);
        return result;
    }
    
    private string? Decrypt(byte[] cipherText)
    {
        try
        {
            if (cipherText == null || cipherText.Length <= 16) return null;

            using var aes = Aes.Create();
            aes.Key = _encryptionKey;
            
            var iv = new byte[16];
            Buffer.BlockCopy(cipherText, 0, iv, 0, iv.Length);
            
            var cipher = new byte[cipherText.Length - iv.Length];
            Buffer.BlockCopy(cipherText, iv.Length, cipher, 0, cipher.Length);
            
            var plainBytes = aes.DecryptCbc(cipher, iv);
            return Encoding.UTF8.GetString(plainBytes);
        }
        catch
        {
            return null; // Decryption failed
        }
    }

    public void Dispose()
    {
        _state.FolderChanged -= OnFolderChanged;
        _mqttClient.Dispose();
    }
}

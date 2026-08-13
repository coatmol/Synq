using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Engine;
using Makaretu.Dns;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace Desktop;

public class LanDiscoveryService : IDisposable
{
    private readonly ConcurrentDictionary<string, (string IP, int Port, string? WanNetworkId)> _discoveredPeers = new();
    private readonly DocumentManager _manager;

    private readonly PeerRouter _router;
    private readonly PeerSyncHandler _syncHandler;
    private readonly SyncManager _syncManager;
    private readonly WorkspaceState _workspaceState;
    private bool _isAdvertising;
    private MulticastService? _mdns;
    private Timer? _pingTimer;
    private ServiceDiscovery? _serviceDiscovery;
    private ServiceProfile? _serviceProfile;

    public LanDiscoveryService(DocumentManager manager, SyncManager syncManager, WorkspaceState workspaceState,
        PeerRouter router, PeerSyncHandler syncHandler)
    {
        _manager = manager;
        _syncManager = syncManager;
        _workspaceState = workspaceState;
        _router = router;
        _syncHandler = syncHandler;
    }

    public int Port { get; private set; }

    public HubConnection? PeerConnection { get; private set; }

    public void Dispose()
    {
        Stop();
        _pingTimer?.Dispose();
        _mdns?.Dispose();
    }

    public void BroadcastQuery()
    {
        _mdns?.SendQuery("_synq._tcp.local", type: DnsType.PTR);
    }

    public void Start(int httpPort)
    {
        Port = httpPort;
        _mdns = new MulticastService();
        _serviceDiscovery = new ServiceDiscovery(_mdns);

        var instanceName = $"{_workspaceState.Settings.Username}-{httpPort}";
        _serviceProfile = new ServiceProfile(instanceName, "_synq._tcp", (ushort)httpPort);

        _mdns.NetworkInterfaceDiscovered += (s, e) => _mdns.SendQuery("_synq._tcp.local", type: DnsType.PTR);

        _serviceDiscovery.ServiceInstanceDiscovered += async (s, e) =>
        {
            var aRecord = e.Message.Answers.OfType<ARecord>().FirstOrDefault() ??
                          e.Message.AdditionalRecords.OfType<ARecord>().FirstOrDefault();
            var srvRecord = e.Message.Answers.OfType<SRVRecord>().FirstOrDefault() ??
                            e.Message.AdditionalRecords.OfType<SRVRecord>().FirstOrDefault();

            if (aRecord != null && srvRecord != null)
            {
                var ipStr = aRecord.Address.ToString();
                var port = srvRecord.Port;
                // Ignore our own broadcast
                if (port == httpPort) return;

                try
                {
                    using var http = new HttpClient();
                    http.Timeout = TimeSpan.FromSeconds(2);
                    var res = await http.GetAsync($"http://{ipStr}:{port}/api/settings");
                    if (res.IsSuccessStatusCode)
                    {
                        var json = await res.Content.ReadAsStringAsync();
                        var data = JsonDocument.Parse(json);
                        var remoteId = data.RootElement.TryGetProperty("wanNetworkId", out var idProp)
                            ? idProp.GetString()
                            : null;

                        _discoveredPeers[e.ServiceInstanceName.ToString()] = (ipStr, port, remoteId);
                    }
                }
                catch
                {
                    // Peer is dead or unresponsive
                }
            }
        };

        _mdns.Start();

        _pingTimer = new Timer(PingPeers, null, 5000, 5000);
    }

    private async void PingPeers(object? state)
    {
        BroadcastQuery();
        var keys = _discoveredPeers.Keys.ToList();
        using var http = new HttpClient();
        http.Timeout = TimeSpan.FromSeconds(2);

        foreach (var key in keys)
            if (_discoveredPeers.TryGetValue(key, out var peer))
                try
                {
                    var res = await http.GetAsync($"http://{peer.IP}:{peer.Port}/api/settings");
                    if (res.IsSuccessStatusCode)
                    {
                        var json = await res.Content.ReadAsStringAsync();
                        var data = JsonDocument.Parse(json);
                        var remoteId = data.RootElement.TryGetProperty("wanNetworkId", out var idProp)
                            ? idProp.GetString()
                            : null;

                        _discoveredPeers[key] = (peer.IP, peer.Port, remoteId);
                    }
                    else
                    {
                        _discoveredPeers.TryRemove(key, out _);
                    }
                }
                catch
                {
                    _discoveredPeers.TryRemove(key, out _);
                }
    }

    public void UpdateUsername(string newUsername)
    {
        if (_serviceProfile != null && _serviceDiscovery != null)
        {
            if (_isAdvertising) _serviceDiscovery.Unadvertise(_serviceProfile);
            _serviceProfile = new ServiceProfile($"{newUsername}-{Port}", "_synq._tcp", (ushort)Port);
            if (_isAdvertising) _serviceDiscovery.Advertise(_serviceProfile);
        }
    }

    public void StartAdvertising()
    {
        if (!_isAdvertising && _serviceDiscovery != null && _serviceProfile != null)
        {
            _serviceDiscovery.Advertise(_serviceProfile);
            _isAdvertising = true;
        }
    }

    public void StopAdvertising()
    {
        if (_isAdvertising && _serviceDiscovery != null && _serviceProfile != null)
        {
            _serviceDiscovery.Unadvertise(_serviceProfile);
            _isAdvertising = false;
        }
    }

    public void Stop()
    {
        StopAdvertising();
        _mdns?.Stop();
    }

    public IEnumerable<object> GetDiscoveredPeers(bool restrictToSameNetworkId = false)
    {
        string? localId = null;
        if (restrictToSameNetworkId && !string.IsNullOrEmpty(_workspaceState.CurrentFolder))
            localId = _syncManager.LoadManifest(_workspaceState.CurrentFolder).WanNetworkId;

        var peers = _discoveredPeers.ToList();

        if (restrictToSameNetworkId && !string.IsNullOrEmpty(localId))
            peers = peers.Where(kvp => kvp.Value.WanNetworkId == localId).ToList();

        return peers.Select((kvp, index) =>
        {
            var actualName = kvp.Key;
            var lastDash = kvp.Key.LastIndexOf("-");
            if (lastDash > 0) actualName = kvp.Key.Substring(0, lastDash);
            return new
            {
                id = index + 1,
                name = actualName,
                ip = kvp.Value.IP,
                port = kvp.Value.Port,
                status = "online",
                init = actualName.Substring(0, Math.Min(2, actualName.Length)).ToUpper()
            };
        });
    }

    public async Task DisconnectFromPeerAsync()
    {
        if (PeerConnection != null)
        {
            await PeerConnection.StopAsync();
            await PeerConnection.DisposeAsync();
            PeerConnection = null;
        }
    }

    public async Task<bool> ConnectToPeerAsync(string ip, int port, IHubContext<DocumentHub> hubContext)
    {
        try
        {
            using var http = new HttpClient();
            if (_workspaceState.Settings.PeerPasswords.TryGetValue($"{ip}:{port}", out var pwd))
                http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pwd);

            var response = await http.GetAsync($"http://{ip}:{port}/api/sync/manifest");
            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode == HttpStatusCode.Unauthorized && !string.IsNullOrEmpty(pwd))
                {
                    _workspaceState.Settings.PeerPasswords.Remove($"{ip}:{port}");
                    _workspaceState.SaveSettings();
                }

                return false;
            }

            var content = await response.Content.ReadAsStringAsync();
            var remoteManifest = JsonSerializer.Deserialize<SyncManifest>(content);

            if (remoteManifest != null)
            {
                // Process manifest diffs locally
                await _syncManager.ProcessRemoteManifest(remoteManifest, $"http://{ip}:{port}");

                // Stop any existing connection
                if (PeerConnection != null) await PeerConnection.StopAsync();

                PeerConnection = new HubConnectionBuilder()
                    .WithUrl($"http://{ip}:{port}/hub", options =>
                    {
                        if (_workspaceState.Settings.PeerPasswords.TryGetValue($"{ip}:{port}", out var pwd2))
                            options.AccessTokenProvider = () => Task.FromResult<string?>(pwd2);
                    })
                    .WithAutomaticReconnect()
                    .Build();

                PeerConnection.On<string, List<CharNode>>("SyncNodes",
                    async (filename, nodes) => { await _syncHandler.HandleSyncNodes(filename, nodes); });

                PeerConnection.On<string, string>("ItemRenamed",
                    async (oldPath, newPath) =>
                    {
                        await _syncHandler.HandleFileEvent("ItemRenamed",
                            new[]
                            {
                                JsonSerializer.SerializeToElement(oldPath), JsonSerializer.SerializeToElement(newPath)
                            });
                    });

                PeerConnection.On<string>("ItemDeleted",
                    async path =>
                    {
                        await _syncHandler.HandleFileEvent("ItemDeleted",
                            new[] { JsonSerializer.SerializeToElement(path) });
                    });

                PeerConnection.On<string>("FileCreated",
                    async filename =>
                    {
                        await _syncHandler.HandleFileEvent("FileCreated",
                            new[] { JsonSerializer.SerializeToElement(filename) });
                    });

                PeerConnection.On<string>("FolderCreated",
                    async path =>
                    {
                        await _syncHandler.HandleFileEvent("FolderCreated",
                            new[] { JsonSerializer.SerializeToElement(path) });
                    });

                PeerConnection.On<string, string>("DocumentUpdated",
                    async (filename, content) =>
                    {
                        await _syncHandler.HandleFileEvent("FileUpdated",
                            new[]
                            {
                                JsonSerializer.SerializeToElement(filename), JsonSerializer.SerializeToElement(content)
                            });
                    });

                await PeerConnection.StartAsync();

                var transport = new LanSignalRTransport($"lan-{ip}:{port}", PeerConnection);
                _router.Register(transport);
                return true;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"P2P Sync failed: {ex.Message}");
        }

        return false;
    }
}

public class LanSignalRTransport : IPeerTransport
{
    public LanSignalRTransport(string id, HubConnection connection)
    {
        TransportId = id;
        Connection = connection;
    }

    public HubConnection Connection { get; }
    public string TransportId { get; }
    public bool IsConnected => Connection.State == HubConnectionState.Connected;

    public async Task SendSyncNodesAsync(string filename, List<CharNode> nodes)
        => await Connection.SendAsync("SyncNodes", filename, nodes);

    public async Task SendFileEventAsync(string eventName, params object[] args)
        => await Connection.SendCoreAsync(eventName, args);

    public Task SendEnvelopeAsync(MeshEnvelope envelope)
        => Task.CompletedTask; // LAN peers don't use envelope protocol
}
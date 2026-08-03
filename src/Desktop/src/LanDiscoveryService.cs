using System.Net;
using System.Net.Sockets;
using System.Text;
using Engine;
using Makaretu.Dns;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace Desktop;

public class LanDiscoveryService : IDisposable
{
    private readonly DocumentManager _manager;
    private readonly SyncManager _syncManager;
    private readonly WorkspaceState _workspaceState;
    private MulticastService? _mdns;
    private ServiceDiscovery? _serviceDiscovery;
    private ServiceProfile? _serviceProfile;
    private bool _isAdvertising = false;
    public int Port { get; private set; }

    public LanDiscoveryService(DocumentManager manager, SyncManager syncManager, WorkspaceState workspaceState)
    {
        _manager = manager;
        _syncManager = syncManager;
        _workspaceState = workspaceState;
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
        
        _serviceDiscovery.ServiceInstanceDiscovered += (s, e) =>
        {
            var aRecord = e.Message.Answers.OfType<ARecord>().FirstOrDefault() ?? e.Message.AdditionalRecords.OfType<ARecord>().FirstOrDefault();
            var srvRecord = e.Message.Answers.OfType<SRVRecord>().FirstOrDefault() ?? e.Message.AdditionalRecords.OfType<SRVRecord>().FirstOrDefault();
            
            if (aRecord != null && srvRecord != null)
            {
                var ipStr = aRecord.Address.ToString();
                var port = srvRecord.Port;
                // Ignore our own broadcast
                if (port == httpPort) return;
                
                _discoveredPeers[e.ServiceInstanceName.ToString()] = (ipStr, port);
                Console.WriteLine($"Discovered peer at {ipStr}:{port}");
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
        {
            if (_discoveredPeers.TryGetValue(key, out var peer))
            {
                try
                {
                    var res = await http.GetAsync($"http://{peer.IP}:{peer.Port}/api/settings");
                    if (!res.IsSuccessStatusCode)
                    {
                        _discoveredPeers.Remove(key);
                    }
                }
                catch
                {
                    _discoveredPeers.Remove(key);
                }
            }
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

    public void Dispose()
    {
        Stop();
        _pingTimer?.Dispose();
        _mdns?.Dispose();
    }

    private readonly Dictionary<string, (string IP, int Port)> _discoveredPeers = new();
    private Timer? _pingTimer;

    public IEnumerable<object> GetDiscoveredPeers()
    {
        return _discoveredPeers.Select((kvp, index) => {
            var actualName = kvp.Key;
            var lastDash = kvp.Key.LastIndexOf("-");
            if (lastDash > 0)
            {
                actualName = kvp.Key.Substring(0, lastDash);
            }
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

    public HubConnection? PeerConnection { get; private set; }

    public async Task DisconnectFromPeerAsync()
    {
        if (PeerConnection != null)
        {
            await PeerConnection.StopAsync();
            await PeerConnection.DisposeAsync();
            PeerConnection = null;
        }
    }

    public async Task<bool> ConnectToPeerAsync(string ip, int port, Microsoft.AspNetCore.SignalR.IHubContext<DocumentHub> hubContext)
    {
        try
        {
            using var http = new HttpClient();
            // Fetch remote manifest
            var response = await http.GetAsync($"http://{ip}:{port}/api/sync/manifest");
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                var remoteManifest = System.Text.Json.JsonSerializer.Deserialize<SyncManifest>(content);
                
                if (remoteManifest != null)
                {
                    // Process manifest diffs locally
                    await _syncManager.ProcessRemoteManifest(remoteManifest, $"http://{ip}:{port}");
                    
                    // Stop any existing connection
                    if (PeerConnection != null) await PeerConnection.StopAsync();

                    PeerConnection = new Microsoft.AspNetCore.SignalR.Client.HubConnectionBuilder()
                        .WithUrl($"http://{ip}:{port}/hub")
                        .WithAutomaticReconnect()
                        .Build();
                        
                    PeerConnection.On<string, List<CharNode>>("SyncNodes", async (filename, nodes) =>
                    {
                        var seq = _manager.GetOrCreateDocument(filename);
                        foreach (var node in nodes)
                        {
                            seq.RemoteMerge(node);
                        }
                        _manager.SaveToDisk(filename);
                        await hubContext.Clients.All.SendAsync("DocumentUpdated", filename, seq.ToString());
                    });
                    
                    PeerConnection.On<string, string>("ItemRenamed", async (oldPath, newPath) =>
                    {
                        var oldAbs = Path.Combine(_workspaceState.CurrentFolder, oldPath);
                        var newAbs = Path.Combine(_workspaceState.CurrentFolder, newPath);
                        if (File.Exists(oldAbs))
                        {
                            var dir = Path.GetDirectoryName(newAbs);
                            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                            File.Move(oldAbs, newAbs);
                        }
                        else if (Directory.Exists(oldAbs))
                        {
                            Directory.Move(oldAbs, newAbs);
                        }
                        _syncManager.InitializeLocalFolder();
                        await hubContext.Clients.All.SendAsync("ItemRenamed", oldPath, newPath);
                    });

                    PeerConnection.On<string>("ItemDeleted", async (path) =>
                    {
                        var filePath = Path.Combine(_workspaceState.CurrentFolder, path);
                        if (File.Exists(filePath)) File.Delete(filePath);
                        else if (Directory.Exists(filePath)) Directory.Delete(filePath, true);
                        _syncManager.InitializeLocalFolder();
                        await hubContext.Clients.All.SendAsync("ItemDeleted", path);
                    });

                    PeerConnection.On<string>("FileCreated", async (filename) =>
                    {
                        var filePath = Path.Combine(_workspaceState.CurrentFolder, filename);
                        var dir = Path.GetDirectoryName(filePath);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                        if (!File.Exists(filePath)) await File.WriteAllTextAsync(filePath, "# " + Path.GetFileNameWithoutExtension(filename));
                        _syncManager.InitializeLocalFolder();
                        await hubContext.Clients.All.SendAsync("FileCreated", filename);
                    });

                    PeerConnection.On<string>("FolderCreated", async (path) =>
                    {
                        var dirPath = Path.Combine(_workspaceState.CurrentFolder, path);
                        if (!Directory.Exists(dirPath)) Directory.CreateDirectory(dirPath);
                        _syncManager.InitializeLocalFolder();
                        await hubContext.Clients.All.SendAsync("FolderCreated", path);
                    });
                    
                    await PeerConnection.StartAsync();
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"P2P Sync failed: {ex.Message}");
        }
        return false;
    }
}
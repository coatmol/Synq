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
        _serviceDiscovery.Advertise(_serviceProfile);
    }

    public void UpdateUsername(string newUsername)
    {
        if (_serviceProfile != null && _serviceDiscovery != null)
        {
            _serviceDiscovery.Unadvertise(_serviceProfile);
            _serviceProfile = new ServiceProfile($"{newUsername}-{Port}", "_synq._tcp", (ushort)Port);
            _serviceDiscovery.Advertise(_serviceProfile);
        }
    }

    public void Stop()
    {
        if (_serviceProfile != null && _serviceDiscovery != null)
        {
            _serviceDiscovery.Unadvertise(_serviceProfile);
        }
        _mdns?.Stop();
    }

    public void Dispose()
    {
        Stop();
        _mdns?.Dispose();
    }

    private readonly Dictionary<string, (string IP, int Port)> _discoveredPeers = new();

    public IEnumerable<object> GetDiscoveredPeers()
    {
        return _discoveredPeers.Select((kvp, index) => new
        {
            id = index + 1,
            name = kvp.Key,
            ip = kvp.Value.IP,
            port = kvp.Value.Port,
            status = "online",
            init = kvp.Key.Substring(0, Math.Min(2, kvp.Key.Length)).ToUpper()
        });
    }

    public HubConnection? PeerConnection { get; private set; }

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
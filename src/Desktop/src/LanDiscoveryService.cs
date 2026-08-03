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
    private MulticastService? _mdns;
    private ServiceDiscovery? _serviceDiscovery;
    public int Port { get; private set; }

    public LanDiscoveryService(DocumentManager manager)
    {
        _manager = manager;
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

        var instanceName = $"{Environment.MachineName}-{httpPort}";
        var service = new ServiceProfile(instanceName, "_synq._tcp", (ushort)httpPort);
        
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

        _serviceDiscovery.Advertise(service);
        _mdns.Start();
    }

    public void Dispose()
    {
        _mdns?.Stop();
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
            var response = await http.GetAsync($"http://{ip}:{port}/api/sync");
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                var data = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(content);
                if (data != null)
                {
                    _manager.OverwriteFromSync(data);
                    
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
using System.Net;
using System.Net.Sockets;
using System.Text;
using Engine;
using Makaretu.Dns;

namespace Desktop;

public class LanDiscoveryService : BackgroundService
{
    private const int Port = 5055;
    private readonly TextSequence _sequence;
    private MulticastService? _mdns;
    private ServiceDiscovery? _serviceDiscovery;
    private TcpListener? _tcpListener;

    public LanDiscoveryService(TextSequence sequence)
    {
        _sequence = sequence;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // 1. Start TCP Listener for incoming peer data streams
        _tcpListener = new TcpListener(IPAddress.Any, Port);
        _tcpListener.Start();
        _ = ListenForPeersAsync(stoppingToken);

        // 2. Start mDNS Broadcast so local peers discover this machine
        _mdns = new MulticastService();
        _serviceDiscovery = new ServiceDiscovery(_mdns);

        var service = new ServiceProfile(Environment.MachineName, "_synq._tcp", Port);
        _serviceDiscovery.Advertise(service);
        _mdns.Start();

        // 3. Listen for other peers appearing on the local network
        _serviceDiscovery.ServiceInstanceDiscovered += (s, e) =>
        {
            var address = e.Message.Answers.OfType<ARecord>().FirstOrDefault()?.Address;
            if (address != null && !address.Equals(IPAddress.Loopback))
                Console.WriteLine($"Discovered peer at {address}:{e.RemoteEndPoint.Port}");
            // TODO: Automatically open an outgoing TCP client connection to this peer
        };

        await Task.CompletedTask;
    }

    private async Task ListenForPeersAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            var client = await _tcpListener!.AcceptTcpClientAsync(token);
            _ = Task.Run(() => HandlePeerConnectionAsync(client, token), token);
        }
    }

    private async Task HandlePeerConnectionAsync(TcpClient client, CancellationToken token)
    {
        using var stream = client.GetStream();
        var buffer = new byte[4096];
        var bytesRead = await stream.ReadAsync(buffer, token);

        // Deserialize incoming delta and merge into local TextSequence state
        var payload = Encoding.UTF8.GetString(buffer, 0, bytesRead);
        // _sequence.MergeRemotePayload(payload);
    }

    public override void Dispose()
    {
        _mdns?.Stop();
        _tcpListener?.Stop();
        base.Dispose();
    }
}
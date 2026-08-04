using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;

namespace Desktop;

public enum NatType
{
    Unknown,
    Open,           // No NAT — public IP matches local IP
    FullCone,       // STUN works perfectly, hole-punching reliable
    Restricted,     // STUN works, hole-punching usually works
    Symmetric       // Different public port per destination — STUN alone won't work
}

public class StunServerResult
{
    public string Url { get; set; } = "";
    public bool IsReachable { get; set; }
    public int LatencyMs { get; set; } = -1;
    public IPEndPoint? ReflexiveEndpoint { get; set; }
}

public class StunDiagnosticService
{
    private static readonly (string Host, int Port)[] StunServers =
    [
        ("stun.l.google.com", 19302),
        ("stun1.l.google.com", 19302),
        ("stun.cloudflare.com", 3478),
        ("stun.nextcloud.com", 443),
        ("stun.services.mozilla.com", 3478)
    ];

    private readonly ConcurrentDictionary<string, StunServerResult> _results = new();
    private NatType _detectedNatType = NatType.Unknown;
    private bool _diagnosticComplete;

    public NatType DetectedNatType => _detectedNatType;
    public bool DiagnosticComplete => _diagnosticComplete;
    public IReadOnlyDictionary<string, StunServerResult> Results => _results;

    /// <summary>
    /// Returns only the STUN servers that responded successfully,
    /// formatted as RTCIceServer URLs for SIPSorcery.
    /// </summary>
    public SIPSorcery.Net.RTCIceServer[] GetAvailableIceServers()
    {
        return _results.Values
            .Where(r => r.IsReachable)
            .Select(r => new SIPSorcery.Net.RTCIceServer { urls = r.Url })
            .ToArray();
    }

    /// <summary>
    /// Run the full diagnostic. Called once on app startup.
    /// Probes all STUN servers concurrently and determines NAT type.
    /// </summary>
    public async Task RunDiagnosticAsync()
    {
        var tasks = StunServers.Select(s => ProbeServerAsync(s.Host, s.Port));
        await Task.WhenAll(tasks);

        // Determine NAT type by comparing reflexive endpoints
        var reflexiveEndpoints = _results.Values
            .Where(r => r.IsReachable && r.ReflexiveEndpoint != null)
            .Select(r => r.ReflexiveEndpoint!)
            .ToList();

        if (reflexiveEndpoints.Count == 0)
        {
            _detectedNatType = NatType.Unknown;
        }
        else
        {
            var distinctIps = reflexiveEndpoints.Select(e => e.Address.ToString()).Distinct().ToList();
            var distinctPorts = reflexiveEndpoints.Select(e => e.Port).Distinct().ToList();

            if (distinctPorts.Count > 1)
            {
                // Different reflexive ports for different STUN servers = Symmetric NAT
                _detectedNatType = NatType.Symmetric;
            }
            else if (distinctIps.Count == 1)
            {
                // Same IP, same port across all servers = Full Cone or Open
                _detectedNatType = NatType.FullCone;
            }
            else
            {
                _detectedNatType = NatType.Restricted;
            }
        }

        _diagnosticComplete = true;
        var reachableCount = _results.Values.Count(r => r.IsReachable);
        Console.WriteLine($"[STUN] Diagnostic complete. " +
                          $"Reachable: {reachableCount}/{StunServers.Length}, " +
                          $"NAT Type: {_detectedNatType}");
    }

    private async Task ProbeServerAsync(string host, int port)
    {
        var url = $"stun:{host}:{port}";
        var result = new StunServerResult { Url = url };

        try
        {
            // Resolve hostname
            var addresses = await Dns.GetHostAddressesAsync(host);
            var ipv4 = addresses.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork);
            if (ipv4 == null)
            {
                _results[url] = result;
                return;
            }

            using var udp = new UdpClient();
            udp.Client.ReceiveTimeout = 3000; // 3s timeout

            var endpoint = new IPEndPoint(ipv4, port);

            // Build a minimal STUN Binding Request (RFC 5389)
            // Header: Type (0x0001), Length (0), Magic Cookie (0x2112A442), Transaction ID (12 bytes)
            var request = new byte[20];
            request[0] = 0x00; request[1] = 0x01; // Binding Request
            request[2] = 0x00; request[3] = 0x00; // Length = 0
            // Magic Cookie
            request[4] = 0x21; request[5] = 0x12;
            request[6] = 0xA4; request[7] = 0x42;
            // Transaction ID (random 12 bytes)
            Random.Shared.NextBytes(request.AsSpan(8, 12));

            var sw = System.Diagnostics.Stopwatch.StartNew();
            await udp.SendAsync(request, request.Length, endpoint);

            var receiveTask = udp.ReceiveAsync();
            var completed = await Task.WhenAny(receiveTask, Task.Delay(3000));
            sw.Stop();

            if (completed == receiveTask && receiveTask.IsCompletedSuccessfully)
            {
                var response = receiveTask.Result;
                result.IsReachable = true;
                result.LatencyMs = (int)sw.ElapsedMilliseconds;

                // Parse XOR-MAPPED-ADDRESS from the STUN response
                result.ReflexiveEndpoint = ParseXorMappedAddress(
                    response.Buffer, request.AsSpan(4, 16).ToArray());
            }
        }
        catch
        {
            // Server unreachable
        }

        _results[url] = result;
    }

    /// <summary>
    /// Parse XOR-MAPPED-ADDRESS (0x0020) attribute from a STUN response.
    /// RFC 5389 Section 15.2.
    /// </summary>
    private static IPEndPoint? ParseXorMappedAddress(byte[] response, byte[] magicAndTxn)
    {
        if (response.Length < 20) return null;

        // Skip 20-byte header, iterate attributes
        var offset = 20;
        while (offset + 4 <= response.Length)
        {
            var attrType = (response[offset] << 8) | response[offset + 1];
            var attrLen = (response[offset + 2] << 8) | response[offset + 3];
            offset += 4;

            if (attrType == 0x0020 && attrLen >= 8) // XOR-MAPPED-ADDRESS
            {
                var family = response[offset + 1]; // 0x01 = IPv4
                if (family != 0x01) return null;

                // XOR port with magic cookie first 2 bytes
                var xPort = ((response[offset + 2] << 8) | response[offset + 3])
                            ^ 0x2112;

                // XOR address with magic cookie (4 bytes)
                var xAddr = new byte[4];
                xAddr[0] = (byte)(response[offset + 4] ^ 0x21);
                xAddr[1] = (byte)(response[offset + 5] ^ 0x12);
                xAddr[2] = (byte)(response[offset + 6] ^ 0xA4);
                xAddr[3] = (byte)(response[offset + 7] ^ 0x42);

                return new IPEndPoint(new IPAddress(xAddr), xPort);
            }

            // Pad to 4-byte boundary
            offset += attrLen + ((4 - attrLen % 4) % 4);
        }

        return null;
    }

    public object GetStatusReport() => new
    {
        complete = _diagnosticComplete,
        natType = _detectedNatType.ToString(),
        canHolePunch = _detectedNatType != NatType.Symmetric && _detectedNatType != NatType.Unknown,
        servers = _results.Values.Select(r => new
        {
            url = r.Url,
            reachable = r.IsReachable,
            latencyMs = r.LatencyMs,
            reflexiveIp = r.ReflexiveEndpoint?.Address.ToString(),
            reflexivePort = r.ReflexiveEndpoint?.Port
        })
    };
}

namespace Desktop;

public class HeartbeatService : IDisposable
{
    private readonly PeerRouter _router;
    private Timer? _timer;

    public HeartbeatService(PeerRouter router)
    {
        _router = router;
    }

    public void Dispose() => _timer?.Dispose();

    public void Start()
    {
        _timer = new Timer(async _ =>
        {
            await _router.BroadcastEnvelopeAsync(new MeshEnvelope
            {
                Type = MeshMessageType.PING,
                SenderId = _router.LocalPeerId
            });
        }, null, 10_000, 10_000);
    }
}
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Desktop;

public enum MeshMessageType
{
    CRDT_DELTA,
    SIGNAL_OFFER,
    SIGNAL_ANSWER,
    ICE_CANDIDATE,
    PEER_DISCOVERY,
    PEER_LEFT,
    MANIFEST_REQUEST,
    MANIFEST_RESPONSE,
    FILE_REQUEST,
    FILE_RESPONSE,
    FILE_EVENT,     // ItemRenamed, ItemDeleted, FileCreated, FolderCreated
    PING,
    PONG
}

public class MeshEnvelope
{
    [JsonPropertyName("v")]   public int Version { get; set; } = 1;
    [JsonPropertyName("t")]   public MeshMessageType Type { get; set; }
    [JsonPropertyName("src")] public string SenderId { get; set; } = "";
    [JsonPropertyName("dst")] public string? TargetId { get; set; }  // null = broadcast
    [JsonPropertyName("p")]   public string Payload { get; set; } = "";

    public string Serialize() => JsonSerializer.Serialize(this);
    public static MeshEnvelope? Deserialize(string json) =>
        JsonSerializer.Deserialize<MeshEnvelope>(json);
}

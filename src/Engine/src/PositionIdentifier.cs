namespace Engine;

public readonly record struct PositionIdentifier(int[] Path, string PeerId, int Id) : IComparable<PositionIdentifier>
{
    public int CompareTo(PositionIdentifier other)
    {
        // Compare path arrays element by element
        var maxLen = Math.Max(Path.Length, other.Path.Length);
        for (var i = 0; i < maxLen; i++)
        {
            var p1 = i < Path.Length ? Path[i] : 0;
            var p2 = i < other.Path.Length ? other.Path[i] : 0;
            if (p1 != p2) return p1.CompareTo(p2);
        }

        // If paths are identical, compare PeerId to break ties deterministically
        var peerComparison = string.Compare(PeerId, other.PeerId, StringComparison.Ordinal);
        if (peerComparison != 0) return peerComparison;

        // Fallback to id
        return Id.CompareTo(other.Id);
    }
}
namespace Engine;

public readonly record struct PositionIdentifier(int[] Path, string PeerId, int Id) : IComparable<PositionIdentifier>, IEquatable<PositionIdentifier>
{
    public bool Equals(PositionIdentifier other)
    {
        if (Path == null && other.Path != null) return false;
        if (Path != null && other.Path == null) return false;
        if (Path != null && other.Path != null)
        {
            if (Path.Length != other.Path.Length) return false;
            for (var i = 0; i < Path.Length; i++)
            {
                if (Path[i] != other.Path[i]) return false;
            }
        }
        
        return string.Equals(PeerId, other.PeerId, StringComparison.Ordinal) && Id == other.Id;
    }

    public override int GetHashCode()
    {
        var hash = new HashCode();
        if (Path != null)
        {
            foreach (var p in Path) hash.Add(p);
        }
        hash.Add(PeerId);
        hash.Add(Id);
        return hash.ToHashCode();
    }

    public int CompareTo(PositionIdentifier other)
    {
        // Compare path arrays element by element
        var maxLen = Math.Max(Path?.Length ?? 0, other.Path?.Length ?? 0);
        for (var i = 0; i < maxLen; i++)
        {
            var p1 = Path != null && i < Path.Length ? Path[i] : 0;
            var p2 = other.Path != null && i < other.Path.Length ? other.Path[i] : 0;
            if (p1 != p2) return p1.CompareTo(p2);
        }

        // If paths are identical, compare PeerId to break ties deterministically
        var peerComparison = string.Compare(PeerId, other.PeerId, StringComparison.Ordinal);
        if (peerComparison != 0) return peerComparison;

        // Fallback to id
        return Id.CompareTo(other.Id);
    }
}
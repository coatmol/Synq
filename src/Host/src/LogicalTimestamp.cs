namespace Host;

public readonly record struct LogicalTimestamp(string PeerId, int Counter) : IComparable<LogicalTimestamp>
{
    public int CompareTo(LogicalTimestamp other)
    {
        if (Counter != other.Counter)
            return Counter.CompareTo(other.Counter);
        
        return string.Compare(PeerId, other.PeerId, StringComparison.Ordinal);
    }
}
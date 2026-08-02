namespace Host;

public class LwwRegister
{
    public string Value { get; private set; }
    public LogicalTimestamp Timestamp { get; private set; }
    
    public LwwRegister(string value, string peerId)
    {
        Value = value;
        Timestamp = new LogicalTimestamp(peerId, 0);
    }
    
    public void Update(string value, LogicalTimestamp newTimestamp)
    {
        if (newTimestamp.CompareTo(Timestamp) > 0)
        {
            Value = value;
            Timestamp = newTimestamp;
        }
    }

    public void Merge(LwwRegister other)
    {
        Update(other.Value, other.Timestamp);
    }
}
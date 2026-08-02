namespace Engine;

public struct CharNode
{
    public PositionIdentifier Id { get; }
    public char Value { get; }
    public bool IsDeleted { get; set; }

    public CharNode(PositionIdentifier id, char value)
    {
        Id = id;
        Value = value;
        IsDeleted = false;
    }
}
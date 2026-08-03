namespace Engine;

public struct CharNode
{
    public PositionIdentifier Id { get; set; }
    public char Value { get; set; }
    public bool IsDeleted { get; set; }

    public CharNode(PositionIdentifier id, char value)
    {
        Id = id;
        Value = value;
        IsDeleted = false;
    }
}
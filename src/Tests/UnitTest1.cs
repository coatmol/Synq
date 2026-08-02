using Engine;

namespace Tests;

public class Tests
{
    [SetUp]
    public void Setup()
    {
    }

    [Test]
    public void Test1()
    {
        var sequence = new TextSequence("Peer A");

        sequence.LocalInsert(0, "Hello, World!");

        sequence.LocalDelete(11);
        sequence.RemoteMerge(
            new CharNode(new PositionIdentifier([60], "Peer A", 11), 'd')
                { IsDeleted = false });

        Assert.AreEqual("Hello, World!", sequence.ToString());
    }
}
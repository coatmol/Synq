using Engine;

namespace Tests;

public class Tests
{
    [SetUp]
    public void Setup()
    {
    }

    [Test]
    public void TestLargePaste()
    {
        var seq = new TextSequence("peer1");
        seq.LocalInsert(0, "Original Text");

        var newText = new string('A', 2000);
        seq.LocalDelete(0, 13);
        seq.LocalInsert(0, newText);

        Assert.AreEqual(2000, seq.ToString().Length);
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

        Assert.AreEqual("Hello, Worl!", sequence.ToString());
    }
}
using Host;

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
        var peerA = new LwwRegister("Hello, World!", "Peer A");
        var peerB = new LwwRegister("Hello, World!", "Peer B");
        
        peerA.Update("Hello, Universe!", new LogicalTimestamp("Peer A", 1));
        peerB.Update("Hello, Multiverse!", new LogicalTimestamp("Peer B", 1));
        
        peerA.Merge(peerB);
        peerB.Merge(peerA);
        
        Assert.AreEqual("Hello, Multiverse!", peerA.Value);
        Assert.AreEqual("Hello, Multiverse!", peerB.Value);
    }
}
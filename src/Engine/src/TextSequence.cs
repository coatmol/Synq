namespace Engine;

public class TextSequence
{
    private readonly object _lock = new();
    private readonly List<CharNode> _nodes = [];
    private readonly string _peerId;
    private int _nextId;

    public TextSequence(string peerId)
    {
        _peerId = peerId;
    }

    public CharNode LocalInsert(int index, char value)
    {
        lock (_lock)
        {
            var activeNodes = _nodes.Where(n => !n.IsDeleted).ToList();

            CharNode? leftNode = index > 0 && index <= activeNodes.Count
                ? activeNodes[index - 1]
                : null;

            CharNode? rightNode = index < activeNodes.Count
                ? activeNodes[index]
                : null;

            var newPath = GeneratePath(leftNode?.Id.Path, rightNode?.Id.Path);

            var newId = new PositionIdentifier(newPath, _peerId, _nextId++);
            var newNode = new CharNode(newId, value);

            var insertIndex = _nodes.BinarySearch(newNode, Comparer<CharNode>.Create((a, b) => a.Id.CompareTo(b.Id)));
            if (insertIndex < 0) insertIndex = ~insertIndex;

            _nodes.Insert(insertIndex, newNode);
            return newNode;
        }
    }

    public List<CharNode> LocalInsert(int index, string value)
    {
        var newNodes = new List<CharNode>();
        foreach (var c in value)
        {
            newNodes.Add(LocalInsert(index, c));
            index++;
        }

        return newNodes;
    }

    public void OverwriteFromContent(string content)
    {
        lock (_lock)
        {
            _nodes.Clear();
            _nextId = 0;
            LocalInsert(0, content);
        }
    }

    public CharNode? LocalDelete(int index)
    {
        lock (_lock)
        {
            var activeNodes = _nodes.Where(n => !n.IsDeleted).ToList();
            if (index < 0 || index >= activeNodes.Count) return null;

            var activeNode = activeNodes[index];
            activeNode.IsDeleted = true;

            var nodeIndex = _nodes.FindIndex(n => n.Id.Equals(activeNode.Id));
            _nodes[nodeIndex] = activeNode;
            return activeNode;
        }
    }

    public List<CharNode> LocalDelete(int index, int length)
    {
        var deletedNodes = new List<CharNode>();
        for (var i = length - 1; i >= 0; i--)
        {
            var deleted = LocalDelete(index + i);
            if (deleted != null) deletedNodes.Add(deleted.Value);
        }

        return deletedNodes;
    }

    public void RemoteMerge(CharNode incomingNode)
    {
        lock (_lock)
        {
            var existingIndex = _nodes.FindIndex(n => n.Id.Equals(incomingNode.Id));
            if (existingIndex < 0)
            {
                var index = _nodes.BinarySearch(incomingNode,
                    Comparer<CharNode>.Create((a, b) => a.Id.CompareTo(b.Id)));
                if (index < 0) index = ~index;
                _nodes.Insert(index, incomingNode);
            }
            else if (incomingNode.IsDeleted)
            {
                var existing = _nodes[existingIndex];
                existing.IsDeleted = true;
                _nodes[existingIndex] = existing;
            }
        }
    }

    public override string ToString()
    {
        lock (_lock)
        {
            return new string(_nodes.Where(n => !n.IsDeleted).Select(n => n.Value).ToArray());
        }
    }

    private static int[] GeneratePath(int[]? leftPath, int[]? rightPath)
    {
        // Case 1: Inserting at the very beginning of an empty or start of document
        if (leftPath == null && rightPath == null) return [5]; // Default middle starting point

        // Case 2: Inserting at the very beginning (no left neighbor)
        if (leftPath == null)
        {
            // Take the first digit of the right path and step down
            var first = rightPath![0];
            return first > 0 ? [first - 1] : [0, 5];
        }

        // Case 3: Inserting at the very end (no right neighbor)
        if (rightPath == null)
        {
            // Increment the last digit or expand the path
            var newPath = new int[leftPath.Length];
            Array.Copy(leftPath, newPath, leftPath.Length);
            newPath[^1] += 5; // Step forward
            return newPath;
        }

        // Case 4: Inserting between two existing nodes
        // Find where the paths diverge and interpolate a middle value
        var maxLen = Math.Max(leftPath.Length, rightPath.Length);
        for (var i = 0; i < maxLen; i++)
        {
            var lVal = i < leftPath.Length ? leftPath[i] : 0;
            var rVal = i < rightPath.Length ? rightPath[i] : 0;

            // If there's a gap between digits (e.g., left is [1, 2] and right is [1, 4])
            if (rVal - lVal > 1)
            {
                var newPath = new int[i + 1];
                Array.Copy(leftPath, newPath, i);
                newPath[i] = lVal + 1;
                return newPath;
            }

            // If they are equal at this depth, keep matching down the tree
            if (lVal == rVal)
            {
            }
        }

        // Fallback: If left and right share an identical path prefix, 
        // append a new depth level with a middle value (e.g., 5)
        var extendedPath = new int[leftPath.Length + 1];
        Array.Copy(leftPath, extendedPath, leftPath.Length);
        extendedPath[^1] = 5;
        return extendedPath;
    }
}
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
        lock (_lock)
        {
            var newNodes = new List<CharNode>(value.Length);
            var activeNodes = _nodes.Where(n => !n.IsDeleted).ToList();

            for (var i = 0; i < value.Length; i++)
            {
                var c = value[i];
                var currentIndex = index + i;

                CharNode? leftNode = currentIndex > 0 && currentIndex <= activeNodes.Count
                    ? activeNodes[currentIndex - 1]
                    : null;

                CharNode? rightNode = currentIndex < activeNodes.Count
                    ? activeNodes[currentIndex]
                    : null;

                var newPath = GeneratePath(leftNode?.Id.Path, rightNode?.Id.Path);

                var newId = new PositionIdentifier(newPath, _peerId, _nextId++);
                var newNode = new CharNode(newId, c);

                var insertIndex =
                    _nodes.BinarySearch(newNode, Comparer<CharNode>.Create((a, b) => a.Id.CompareTo(b.Id)));
                if (insertIndex < 0) insertIndex = ~insertIndex;

                _nodes.Insert(insertIndex, newNode);
                activeNodes.Insert(currentIndex, newNode);
                newNodes.Add(newNode);
            }

            return newNodes;
        }
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

            var nodeIndex = _nodes.BinarySearch(activeNode, Comparer<CharNode>.Create((a, b) => a.Id.CompareTo(b.Id)));
            if (nodeIndex >= 0) _nodes[nodeIndex] = activeNode;
            return activeNode;
        }
    }

    public List<CharNode> LocalDelete(int index, int length)
    {
        lock (_lock)
        {
            var deletedNodes = new List<CharNode>();
            var activeNodes = _nodes.Where(n => !n.IsDeleted).ToList();

            for (var i = length - 1; i >= 0; i--)
            {
                var delIndex = index + i;
                if (delIndex < 0 || delIndex >= activeNodes.Count) continue;

                var activeNode = activeNodes[delIndex];
                activeNode.IsDeleted = true;

                var nodeIndex =
                    _nodes.BinarySearch(activeNode, Comparer<CharNode>.Create((a, b) => a.Id.CompareTo(b.Id)));
                if (nodeIndex >= 0) _nodes[nodeIndex] = activeNode;

                deletedNodes.Add(activeNode);
            }

            return deletedNodes;
        }
    }

    public void RemoteMerge(CharNode incomingNode)
    {
        lock (_lock)
        {
            var existingIndex =
                _nodes.BinarySearch(incomingNode, Comparer<CharNode>.Create((a, b) => a.Id.CompareTo(b.Id)));
            if (existingIndex < 0)
            {
                var index = ~existingIndex;
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
        if (leftPath == null && rightPath == null) return [10000];

        if (leftPath == null)
        {
            var first = rightPath![0];
            return first > 1 ? [first - 1] : [0, 10000];
        }

        if (rightPath == null)
        {
            var newPath = new int[leftPath.Length];
            Array.Copy(leftPath, newPath, leftPath.Length);
            // check overflow
            if (newPath[^1] < int.MaxValue - 10000)
            {
                newPath[^1] += 10000;
            }
            else
            {
                var extended = new int[leftPath.Length + 1];
                Array.Copy(leftPath, extended, leftPath.Length);
                extended[^1] = 10000;
                return extended;
            }

            return newPath;
        }

        // Inserting between leftPath and rightPath
        var maxLen = Math.Max(leftPath.Length, rightPath.Length);
        for (var i = 0; i < maxLen; i++)
        {
            var lVal = i < leftPath.Length ? leftPath[i] : 0;
            var rVal = i < rightPath.Length ? rightPath[i] : 0;

            if (lVal == rVal) continue;

            // They differ at index i.
            if (rVal - lVal > 1)
            {
                var newPath = new int[i + 1];
                Array.Copy(leftPath, newPath, Math.Min(leftPath.Length, i));
                newPath[i] = lVal + (rVal - lVal) / 2;
                return newPath;
            }

            // rVal - lVal == 1
            if (i == leftPath.Length - 1)
            {
                var extended = new int[leftPath.Length + 1];
                Array.Copy(leftPath, extended, leftPath.Length);
                extended[^1] = 10000;
                return extended;
            }

            var deepPath = new int[leftPath.Length];
            Array.Copy(leftPath, deepPath, leftPath.Length);

            if (deepPath[^1] < int.MaxValue - 10000)
            {
                deepPath[^1] += 10000;
                return deepPath;
            }

            {
                var extended = new int[leftPath.Length + 1];
                Array.Copy(leftPath, extended, leftPath.Length);
                extended[^1] = 10000;
                return extended;
            }
        }

        var fallback = new int[leftPath.Length + 1];
        Array.Copy(leftPath, fallback, leftPath.Length);
        fallback[^1] = 10000;
        return fallback;
    }
}
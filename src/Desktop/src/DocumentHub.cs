using Engine;
using Microsoft.AspNetCore.SignalR;

namespace Desktop;

public class DocumentHub : Hub
{
    private readonly TextSequence _sequence;

    public DocumentHub(TextSequence sequence)
    {
        _sequence = sequence;
    }

    public async Task InsertCharacter(int index, char value)
    {
        _sequence.LocalInsert(index, value);
        await Clients.All.SendAsync("DocumentUpdated", _sequence.ToString());
    }

    public async Task InsertText(int index, string value)
    {
        _sequence.LocalInsert(index, value);
        await Clients.All.SendAsync("DocumentUpdated", _sequence.ToString());
    }

    public async Task DeleteCharacter(int index)
    {
        _sequence.LocalDelete(index);
        await Clients.All.SendAsync("DocumentUpdated", _sequence.ToString());
    }

    public async Task DeleteText(int index, int length)
    {
        _sequence.LocalDelete(index, length);
        await Clients.All.SendAsync("DocumentUpdated", _sequence.ToString());
    }
}
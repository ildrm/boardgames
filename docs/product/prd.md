# Tablemate release brief

Two friends can open a private link and finish a game in a browser. Tablemate launches with Tic-Tac-Toe and Four in a Row. Chess, public matchmaking, chat and registered profiles are outside the release.

| Role | First action | How they know it worked | Recovery |
|---|---|---|---|
| Host | Choose a game, create a room and copy its link | Their seat appears and Start becomes available after the guest connects | Select the link if copy fails. Rotate it if the original is lost or expires. |
| Guest | Open the link and choose Join | The guest seat and waiting-for-host status appear | Ask for a fresh link if it is unavailable. Return to an existing room when prompted. |
| Either player | Inspect whose turn it is and select a legal move | Both boards show the confirmed piece and next turn | Wait for a fresh snapshot on reconnection. The server resolves outcomes. |
| Both players | Review result and consent to another round | Host sees Start rematch after both agree | A declared abandonment returns to the room. Leaving or replacing a seat clears consent. |

Audience assumptions include friends playing remotely, family groups and pairs using different devices or languages. Observe a host and a guest doing each task without instructions. Record completion, pauses and first-click errors. Five-participant research remains a separate release work item.

[Scope, rules, replay fixtures and measurement](../MEGA_PROMPT.md)
